"""Public method names; serialized stage IDs and source ordering stay stable."""
import re

METHOD_NAMES = {'V1': 'MaT4DGS', 'V2': 'Mono4DGs', 'V3': 'Mercy (ours)'}
_TOKEN = re.compile(r'(?<![A-Za-z0-9_])V[123](?![A-Za-z0-9_])')


def method_text(value):
    """Rename display text, including Chinese-adjacent labels, exactly once."""
    return _TOKEN.sub(lambda match: METHOD_NAMES[match.group()], str(value))


def rename_figure(figure):
    """Apply names to all Matplotlib text without changing data or artist order."""
    from matplotlib.text import Text
    from matplotlib.ticker import FuncFormatter
    for axes in figure.axes:
        for axis in (axes.xaxis, axes.yaxis):
            formatter = axis.get_major_formatter()
            labels = formatter.format_ticks(axis.get_majorticklocs())
            if any(method_text(label) != label for label in labels):
                axis.set_major_formatter(FuncFormatter(lambda x, pos, original=formatter: method_text(original(x, pos))))
    for artist in figure.findobj(match=Text):
        artist.set_text(method_text(artist.get_text()))
