#!/usr/bin/env python3
"""
inject_editor.py - inject (or upgrade) the Brain PAGE Edit Mode into an HTML page.

Usage:
  python3 scripts/inject_editor.py path/to/page.html

Designed for single-page HTML proposals, landing pages, and editorial-style
scrolling documents (NOT slide decks — use deck-edit-mode for those).

Additive: appends editor.css before the last </style> (or before </head> if
the page has no <style>) and editor.js before </body>. If a previous version
is present (CSS marker / __brainEdInit script), it is replaced in place. If
a deck-edit-mode block is detected, it is removed first to prevent conflicts.

Always make a backup before running on a file you care about.
"""
import sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
CSS_MARK = '/* ===== BRAIN PAGE · EDIT MODE UI'
DECK_CSS_MARK = '/* ===== BRAIN DECK · EDIT MODE UI'
JS_MARK = '__brainEdInit'


def _strip_block(src: str, mark: str, end_tag: str) -> str:
    i = src.find(mark)
    if i == -1:
        return src
    e = src.find(end_tag, i)
    if e == -1:
        return src
    return src[:i] + src[e:]


def inject(path: str) -> None:
    src = open(path, encoding='utf-8').read()
    css = open(os.path.join(HERE, 'editor.css'), encoding='utf-8').read()
    js = open(os.path.join(HERE, 'editor.js'), encoding='utf-8').read()

    # ---- CSS: drop any deck-edit-mode CSS first (would conflict on #ed-fab etc.)
    src = _strip_block(src, DECK_CSS_MARK, '</style>')

    ci = src.find(CSS_MARK)
    if ci != -1:
        ce = src.find('</style>', ci)
        assert ce != -1, 'editor CSS marker found but no closing </style>'
        src = src[:ci] + css.strip() + '\n' + src[ce:]
    else:
        si = src.rfind('</style>')
        if si == -1:
            hi = src.rfind('</head>')
            assert hi != -1, 'no </head> in document; cannot inject CSS'
            src = src[:hi] + '<style>\n' + css + '\n</style>\n' + src[hi:]
        else:
            src = src[:si] + css + '\n' + src[si:]

    # ---- JS: replace the <script> containing __brainEdInit, else append before </body>
    ji = src.find(JS_MARK)
    if ji != -1:
        js_start = src.rfind('<script>', 0, ji)
        js_end = src.find('</script>', ji)
        assert js_start != -1 and js_end != -1, 'editor JS marker found but script bounds missing'
        src = src[:js_start] + '<script>\n' + js + '\n</script>' + src[js_end + len('</script>'):]
    else:
        bi = src.rfind('</body>')
        assert bi != -1, 'no </body> in document; cannot inject JS'
        src = src[:bi] + '<script>\n' + js + '\n</script>\n' + src[bi:]

    open(path, 'w', encoding='utf-8').write(src)
    print(f'page editor injected into {path} ({len(src)} bytes)')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    inject(sys.argv[1])
