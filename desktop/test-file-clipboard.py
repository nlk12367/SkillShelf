"""Windows test utility: place synthetic fixture paths in CF_HDROP."""
import ctypes
import json
import struct
import sys
from ctypes import wintypes


def write_paths(paths):
    user32 = ctypes.WinDLL('user32', use_last_error=True)
    kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel32.GlobalAlloc.argtypes = [wintypes.UINT, ctypes.c_size_t]
    kernel32.GlobalAlloc.restype = wintypes.HGLOBAL
    kernel32.GlobalLock.argtypes = [wintypes.HGLOBAL]
    kernel32.GlobalLock.restype = ctypes.c_void_p
    kernel32.GlobalUnlock.argtypes = [wintypes.HGLOBAL]
    kernel32.GlobalFree.argtypes = [wintypes.HGLOBAL]
    user32.CreateWindowExW.argtypes = [wintypes.DWORD, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.DWORD,
                                     ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int,
                                     wintypes.HWND, wintypes.HMENU, wintypes.HINSTANCE, ctypes.c_void_p]
    user32.CreateWindowExW.restype = wintypes.HWND
    user32.OpenClipboard.argtypes = [wintypes.HWND]
    user32.OpenClipboard.restype = wintypes.BOOL
    user32.SetClipboardData.argtypes = [wintypes.UINT, wintypes.HANDLE]
    user32.SetClipboardData.restype = wintypes.HANDLE
    user32.DestroyWindow.argtypes = [wintypes.HWND]
    window = user32.CreateWindowExW(0, 'STATIC', 'Skills clipboard test', 0, 0, 0, 0, 0, None, None, None, None)
    if not window:
        raise ctypes.WinError(ctypes.get_last_error())
    payload = struct.pack('<IiiII', 20, 0, 0, 0, 1) + ('\0'.join(paths) + '\0\0').encode('utf-16-le')
    handle = kernel32.GlobalAlloc(2, len(payload))
    transferred = False
    try:
        pointer = kernel32.GlobalLock(handle)
        if not pointer:
            raise ctypes.WinError(ctypes.get_last_error())
        ctypes.memmove(pointer, payload, len(payload))
        kernel32.GlobalUnlock(handle)
        if not user32.OpenClipboard(window):
            raise ctypes.WinError(ctypes.get_last_error())
        try:
            if not user32.EmptyClipboard() or not user32.SetClipboardData(15, handle):
                raise ctypes.WinError(ctypes.get_last_error())
            transferred = True
        finally:
            user32.CloseClipboard()
    finally:
        if not transferred:
            kernel32.GlobalFree(handle)
        user32.DestroyWindow(window)


if __name__ == '__main__':
    write_paths(json.loads(sys.stdin.buffer.read().decode('utf-8')))
