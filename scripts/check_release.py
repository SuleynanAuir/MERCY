"""Dependency-free syntax, local import, and packaging checks."""
import ast
from pathlib import Path

root = Path(__file__).resolve().parents[1]
files = [p for folder in ('scripts', 'utils', 'scene', 'arguments', 'gaussian_renderer')
         for p in (root / folder).rglob('*.py')]
errors = []
for path in files:
    tree = ast.parse(path.read_text(), filename=str(path))
    for node in ast.walk(tree):
        names = [n.name for n in node.names] if isinstance(node, ast.Import) else (
            [node.module] if isinstance(node, ast.ImportFrom) and not node.level and node.module else [])
        for name in names:
            if name.split('.')[0] not in {'scripts', 'utils', 'scene', 'arguments', 'gaussian_renderer'}:
                continue
            target = root / name.replace('.', '/')
            if not target.with_suffix('.py').is_file() and not (target / '__init__.py').is_file():
                errors.append(f'{path.relative_to(root)}: missing {name}')
for path in (root / 'docs/figures').iterdir():
    assert path.stat().st_size < 20 * 1024 * 1024, path
assert not errors, '\n'.join(errors)
print(f'Validated syntax and local imports for {len(files)} Python files.')
