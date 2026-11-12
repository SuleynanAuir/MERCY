/* English presentation for legacy server responses. IDs and asset paths stay intact. */
'use strict';
(() => {
  const methods = {V1: 'MaT4DGS', V2: 'Mono4DGs', V3: 'Mercy (ours)'};
  const objects = {lego: 'Lego', fan: 'Fan', lamp: 'Lamp', metronome: 'Metronome', microphone: 'Microphone', arm: 'Arm', robot: 'Robot', gears: 'Gears', rotation: 'Rotation'};
  const phrases = {
    "\u5df2\u6709\u5bfc\u51fa\u6b63\u5728\u8fd0\u884c": "An export is already running",
    "\u672a\u914d\u7f6e": "Renderer not configured",
    "\u5df2\u6709\u4efb\u52a1": "A job is already running",
    "\u9884\u70ed\u6e32\u67d3\u5668": "Warming up renderer",
    "\u5bfc\u51fa\u5931\u8d25": "Export failed",
    "\u78c1\u76d8\u7a7a\u95f4\u4e0d\u8db3": "Insufficient disk space",
    "\u51c6\u5907\u76f8\u673a\u4e0e\u914d\u7f6e": "Preparing camera and configuration",
    "\u5bfc\u51fa\u91c7\u6837\u5e27\u4e0e\u5173\u952e\u8fd0\u52a8\u6570\u636e": "Exporting sampled frames and motion data",
    "\u4fdd\u5b58\u8fd0\u52a8\u8f68\u8ff9": "Saving motion trajectories",
    "\u4fdd\u5b58\u53c2\u8003\u6570\u636e": "Saving reference data",
    "\u91cd\u590d\u6027\u80fd\u6d4b\u91cf": "Running repeated performance measurements",
    "\u8bb0\u5f55\u6a21\u578b\u6765\u6e90\u4e0e\u54c8\u5e0c": "Recording model sources and hashes",
    "\u4fdd\u5b58\u914d\u7f6e\u4e0e\u8bc4\u6d4b\u811a\u672c": "Saving configuration and evaluation scripts",
    "\u6821\u9a8c\u6587\u4ef6\u54c8\u5e0c": "Verifying file hashes",
    "\u6253\u5305\u4e0b\u8f7d\u6587\u4ef6": "Packaging download",

    '\u6b63\u5728\u8fde\u63a5\u6e32\u67d3\u670d\u52a1\uff0c\u8bf7\u4fdd\u6301 SSH \u96a7\u9053\u8fd0\u884c': 'Connecting to the renderer. Keep the SSH tunnel running.',
    '\u7248\u672c\u6620\u5c04\u5df2\u5c31\u7eea': 'Renderer ready',
    '\u6e32\u67d3\u670d\u52a1\u8fde\u63a5\u4e2d\u65ad': 'Rendering connection interrupted',
    '\u573a\u666f\u52a0\u8f7d\u5931\u8d25': 'Scene loading failed',
    '\u6e32\u67d3\u5931\u8d25': 'Rendering failed',
    '\u52a0\u8f7d\u5931\u8d25': 'Load failed',
    '\u539f\u59cb\u6587\u4ef6': 'Original', '\u4fee\u6b63\u6587\u4ef6': 'Corrected',
    '\u6b63\u5728\u52a0\u8f7d': 'Loading', '\u6b63\u5728\u6e32\u67d3': 'Rendering',
    '\u6b63\u5728\u8fde\u63a5': 'Connecting', '\u6b63\u5728\u9884\u70ed': 'Warming up',
    '\u6b63\u5728\u51c6\u5907': 'Preparing', '\u6b63\u5728\u5bfc\u51fa': 'Exporting',
    '\u6b63\u5728\u6253\u5305': 'Packaging', '\u5df2\u5c31\u7eea': 'Ready',
    '\u5df2\u5b8c\u6210': 'Complete', '\u5df2\u53d6\u6d88': 'Cancelled',
    '\u8bad\u7ec3': 'Training', '\u6e32\u67d3': 'Rendering', '\u6a21\u578b': 'Model',
    '\u9ad8\u65af': 'Gaussians', '\u7f13\u5b58': 'Cache', '\u52a8\u753b': 'Animation'
  };
  const han = /[\u3400-\u9fff]/;
  function text(value, fallback = 'Server operation in progress.') {
    let result = String(value ?? '');
    if (!han.test(result)) return result;
    for (const [source, target] of Object.entries(phrases)) result = result.split(source).join(target);
    return han.test(result) ? fallback : result.replace(/\uff0c/g, ', ').replace(/\uff1a/g, ': ').replace(/\u3002/g, '. ');
  }
  function objectName(id) {return objects[String(id).toLowerCase()] || text(id, 'Object');}
  function methodName(value, fallback = 'Method') {
    const label = String(value || '');
    if (label.startsWith('\u6700\u539f\u59cb\u7ed3\u679c')) return 'Original';
    if (label.startsWith('\u8fdb\u4e00\u6b65\u4f18\u5316\u540e')) return 'Optimized';
    const legacy = label.match(/^V[123](?![A-Za-z0-9_])/);
    if (legacy) return methods[legacy[0]];
    const named = Object.values(methods).find(name => label.startsWith(name));
    if (named) return named;
    if (/^MaTGS\b/.test(label)) return methods.V1;
    if (/^MonoGS\b/.test(label)) return methods.V2;
    if (/^Mercy\b/i.test(label)) return methods.V3;
    return text(label, fallback);
  }
  function viewerStatus(data) {
    if (data.message) data.message = text(data.message, data.error ? 'Renderer error. Check the server logs.' : 'Preparing the renderer…');
    if (data.detail) data.detail = text(data.detail, 'See the rendering server logs for details.');
    for (const item of data.objects || []) item.name = objectName(item.id);
    const scene = data.scene;
    if (scene) {
      scene.name = data.scene_id ? objectName(data.scene_id) : text(scene.name, 'Gaussian Scene');
      scene.description = '';
      if (scene.motion_label) scene.motion_label = text(scene.motion_label, 'Animated Gaussian sequence');
      for (const record of [scene, ...['clay', 'mesh', 'hybrid', 'pseudocolor'].map(key => scene[key]).filter(Boolean)]) {
        for (const key of ['left_label', 'right_label']) if (record[key]) record[key] = methodName(record[key]);
        record.description = '';
        if (record.quality_descriptions) record.quality_descriptions = {};
      }
      if (scene.version_labels) scene.version_labels = scene.version_labels.map(value => methodName(value));
      if (scene.mode_version_labels) for (const [mode, labels] of Object.entries(scene.mode_version_labels)) scene.mode_version_labels[mode] = labels.map(value => methodName(value));
    }
    return data;
  }
  window.UIEnglish = {text, methodName, objectName, viewerStatus};
})();
