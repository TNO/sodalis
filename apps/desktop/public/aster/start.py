#!/usr/bin/env python3
"""Serve Aster on this computer only. No third-party packages are required."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse, sys, threading, webbrowser

class Handler(SimpleHTTPRequestHandler):
    extensions_map={**SimpleHTTPRequestHandler.extensions_map,'.js':'text/javascript','.css':'text/css','.webmanifest':'application/manifest+json','.svg':'image/svg+xml'}
    def end_headers(self):
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Cache-Control','no-cache')
        super().end_headers()

def main()->int:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port',type=int,default=8765)
    parser.add_argument('--no-browser',action='store_true')
    args=parser.parse_args()
    if not 1<=args.port<=65535:
        parser.error('--port must be between 1 and 65535')
    root=Path(__file__).resolve().parent
    try:
        server=ThreadingHTTPServer(('127.0.0.1',args.port),partial(Handler,directory=str(root)))
    except OSError as error:
        print(f'Could not start the local server: {error}',file=sys.stderr)
        print('Close the other server or choose --port 8766. A different host or port has separate browser storage.',file=sys.stderr)
        return 1
    url=f'http://localhost:{args.port}/'
    print('\nASTER DESKTOP\n'+url+'\n')
    print('Keep this terminal open while using Aster. Press Ctrl+C to stop.')
    print('The server is bound to 127.0.0.1 and is not exposed to your network.')
    print('Use the same browser, hostname and port to reopen your saved workspace.\n')
    if not args.no_browser:
        timer=threading.Timer(.3,lambda:webbrowser.open(url));timer.daemon=True;timer.start()
    try:
        server.serve_forever(poll_interval=.25)
    except KeyboardInterrupt:
        print('\nAster server stopped. Saved browser-local files are not deleted.')
    finally:
        server.server_close()
    return 0

if __name__=='__main__':raise SystemExit(main())
