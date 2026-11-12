"""Serve existing viewer ports with one GPU worker, selected on demand.

Each switch exits the previous worker before loading the next scene, releasing
CUDA contexts as well as tensors. Model and reference paths remain unchanged.
"""
import argparse
import asyncio
import json
import logging
import os
from pathlib import Path
import signal

from aiohttp import ClientSession, ClientTimeout, WSMsgType, web
from scripts.viewer.serve_multi_object_ui import local_only

LOG = logging.getLogger('viewer-pool')


def scene_command(row, scene, worker_port, state_dir, repo):
    command = list(row['command'])
    source = Path(command[command.index('--scenes_path') + 1])
    if not source.is_absolute():
        source = repo / source
    config = json.loads(source.read_text())
    matches = [item.copy() for item in config['scenes'] if item['id'] == scene]
    if not matches:
        raise web.HTTPNotFound(text='Unknown scene')
    for item in matches:
        for field in ('path', 'reference_path', 'evaluation_path', 'middle_path'):
            if item.get(field):
                item[field] = str((source.parent / item[field]).resolve())
    target = state_dir / f"scene-{row['port']}-{scene}.json"
    target.write_text(json.dumps({**config, 'default': scene, 'scenes': matches}))
    command[command.index('--scenes_path') + 1] = str(target)
    command[command.index('--port') + 1] = str(worker_port)
    return command


class Pool:
    def __init__(self, rows, repo, state_dir, worker_port):
        self.rows = {int(row['port']): row for row in rows if 'viewer.py' in row['command']}
        self.repo, self.state_dir, self.worker_port = repo, state_dir, worker_port
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self.lock = asyncio.Lock()
        self.active = None
        self.process = None
        self.sockets = set()
        self.busy_requests = 0
        self.export_jobs = set()

    async def stop(self):
        for socket in list(self.sockets):
            await socket.send_json({'type': 'renderer_paused', 'message': 'Another object is using the renderer. Refresh this page to resume.'})
            await socket.close(code=1001, message=b'Another scene selected')
        if self.process and self.process.returncode is None:
            self.process.terminate()
            try:
                await asyncio.wait_for(self.process.wait(), 5)
            except asyncio.TimeoutError:
                self.process.kill()
                await self.process.wait()
        self.process = None
        self.active = None

    async def select(self, port, scene):
        async with self.lock:
            key = (port, scene)
            if self.active == key and self.process and self.process.returncode is None:
                return
            if self.busy_requests:
                raise web.HTTPConflict(text='Wait for the current export or request to finish before switching scenes.')
            if self.active and self.export_jobs:
                for job in list(self.export_jobs):
                    async with self.http.get(f'http://127.0.0.1:{self.worker_port}/api/experiments/{job}',
                                             params={'scene': self.active[1]}) as response:
                        data = await response.json()
                        if data.get('status') == 'running':
                            raise web.HTTPConflict(text='An experiment export is running. Wait before switching scenes.')
                        self.export_jobs.discard(job)
            command = scene_command(self.rows[port], scene, self.worker_port, self.state_dir, self.repo)
            await self.stop()
            env = os.environ.copy()
            env['PATH'] = str(Path(command[0]).parent) + ':/usr/local/cuda/bin:' + env.get('PATH', '')
            env.setdefault('CUDA_HOME', '/usr/local/cuda')
            env.setdefault('MAX_JOBS', '2')
            log_path = self.state_dir / f'{port}-{scene}.log'
            with log_path.open('ab') as log:
                self.process = await asyncio.create_subprocess_exec(*command, cwd=self.repo, env=env,
                                                                   stdout=log, stderr=log)
            self.active = key
            LOG.info('Selected %s, worker PID %s, log %s', key, self.process.pid, log_path)
            # Wait only for HTTP startup. Model loading remains asynchronous.
            for _ in range(100):
                if self.process.returncode is not None:
                    raise web.HTTPServiceUnavailable(text=f'Worker startup failed. See {log_path.name}')
                try:
                    reader, writer = await asyncio.open_connection('127.0.0.1', self.worker_port)
                    writer.close()
                    await writer.wait_closed()
                    return
                except OSError:
                    await asyncio.sleep(.1)
            raise web.HTTPServiceUnavailable(text='Worker is starting. Retry shortly.')

    async def handle(self, request):
        port = request.transport.get_extra_info('sockname')[1]
        row = self.rows[port]
        source = Path(row['command'][row['command'].index('--scenes_path') + 1])
        config = json.loads(source.read_text())
        scene = request.query.get('scene', config['default'])
        key = (port, scene)
        if request.path == '/api/status':
            await self.select(port, scene)
        if self.active != key:
            raise web.HTTPServiceUnavailable(text='Select this scene to activate its renderer.')
        url = f'http://127.0.0.1:{self.worker_port}{request.rel_url}'
        if request.path == '/ws':
            async with self.http.ws_connect(url, heartbeat=20, max_msg_size=32*1024**2) as upstream:
                ws = web.WebSocketResponse(heartbeat=20, max_msg_size=4096)
                await ws.prepare(request)
                self.sockets.add(ws)
                async def relay(source, target):
                    async for message in source:
                        if message.type == WSMsgType.TEXT:
                            await target.send_str(message.data)
                        elif message.type == WSMsgType.BINARY:
                            await target.send_bytes(message.data)
                tasks = [asyncio.create_task(relay(ws, upstream)), asyncio.create_task(relay(upstream, ws))]
                try:
                    await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                finally:
                    for task in tasks:
                        task.cancel()
                    await asyncio.gather(*tasks, return_exceptions=True)
                    self.sockets.discard(ws)
                    await ws.close()
                return ws
        self.busy_requests += 1
        try:
            async with self.http.request(request.method, url, data=await request.read(),
                    headers={k: v for k, v in request.headers.items() if k.lower() in ('content-type', 'range')}) as response:
                headers = {k: v for k, v in response.headers.items() if k.lower() in
                           ('content-type', 'content-disposition', 'content-length', 'content-range', 'accept-ranges', 'cache-control')}
                if request.method == 'POST' and request.path == '/api/experiments' and response.status == 202:
                    body = await response.read()
                    self.export_jobs.add(json.loads(body)['id'])
                    return web.Response(body=body, status=response.status, headers=headers)
                result = web.StreamResponse(status=response.status, headers=headers)
                await result.prepare(request)
                async for chunk in response.content.iter_chunked(1024*1024):
                    await result.write(chunk)
                await result.write_eof()
                return result
        finally:
            self.busy_requests -= 1

    async def run(self):
        async with ClientSession(timeout=ClientTimeout(total=None), auto_decompress=False) as self.http:
            app = web.Application(middlewares=[local_only], client_max_size=8*1024**3)
            app.router.add_route('*', '/{path:.*}', self.handle)
            runner = web.AppRunner(app)
            await runner.setup()
            for port in self.rows:
                await web.TCPSite(runner, '127.0.0.1', port).start()
            stopped = asyncio.Event()
            for sig in (signal.SIGINT, signal.SIGTERM):
                asyncio.get_running_loop().add_signal_handler(sig, stopped.set)
            try:
                await stopped.wait()
            finally:
                await self.stop()
                await runner.cleanup()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--state-dir', type=Path, required=True)
    parser.add_argument('--worker-port', type=int, default=8990)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    asyncio.run(Pool(json.loads(args.manifest.read_text()), args.repo, args.state_dir, args.worker_port).run())
