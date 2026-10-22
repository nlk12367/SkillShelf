"""Read only Windows CF_HDROP file paths on an explicit user paste action."""
import ctypes
import json
import sys
import time
from ctypes import wintypes


def read_paths():
    if sys.platform != 'win32':
        return []
    user32 = ctypes.WinDLL('user32', use_last_error=True)
    shell32 = ctypes.WinDLL('shell32', use_last_error=True)
    user32.OpenClipboard.argtypes = [wintypes.HWND]
    user32.OpenClipboard.restype = wintypes.BOOL
    user32.CloseClipboard.argtypes = []
    user32.CloseClipboard.restype = wintypes.BOOL
    user32.IsClipboardFormatAvailable.argtypes = [wintypes.UINT]
    user32.IsClipboardFormatAvailable.restype = wintypes.BOOL
    user32.GetClipboardData.argtypes = [wintypes.UINT]
    user32.GetClipboardData.restype = wintypes.HANDLE
    shell32.DragQueryFileW.argtypes = [wintypes.HANDLE, wintypes.UINT, wintypes.LPWSTR, wintypes.UINT]
    shell32.DragQueryFileW.restype = wintypes.UINT
    for attempt in range(5):
        if user32.OpenClipboard(None):
            break
        time.sleep(0.04)
    else:
        raise OSError('剪貼簿暫時忙碌，請再貼上一次。')
    try:
        if not user32.IsClipboardFormatAvailable(15):
            return []
        handle = user32.GetClipboardData(15)
        if not handle:
            raise ctypes.WinError(ctypes.get_last_error())
        count = shell32.DragQueryFileW(handle, 0xFFFFFFFF, None, 0)
        if count > 100:
            raise ValueError('一次最多可貼上 100 個檔案。')
        paths = []
        for index in range(count):
            length = shell32.DragQueryFileW(handle, index, None, 0)
            buffer = ctypes.create_unicode_buffer(length + 1)
            shell32.DragQueryFileW(handle, index, buffer, length + 1)
            paths.append(buffer.value)
        return paths
    finally:
        user32.CloseClipboard()


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    try:
        print(json.dumps(read_paths(), ensure_ascii=False))
    except (OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
