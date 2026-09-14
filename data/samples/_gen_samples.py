import struct, zlib, os

def write_png(path, w, h, pixels):
    raw = b""
    for y in range(h):
        row = pixels[y]
        flat = bytearray()
        for px in row:
            flat.extend(px)
        raw += b"\x00" + bytes(flat)
    sig = b"\x89PNG\r\n\x1a\n"
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    with open(path, "wb") as f:
        f.write(sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))

def blank(w, h, bg=(255, 255, 255)):
    return [[bg] * w for _ in range(h)]

def fill_rect(img, x0, y0, x1, y1, color):
    for y in range(max(0, y0), min(len(img), y1)):
        for x in range(max(0, x0), min(len(img[0]), x1)):
            img[y][x] = color

FONT = {}
def addchar(c, rows):
    FONT[c] = [list(r) for r in rows]

addchar("I", ["11111","00100","00100","00100","00100","00100","11111"])
addchar("N", ["10001","11001","10101","10101","10011","10001","10001"])
addchar("S", ["01111","10000","10000","01110","00001","00001","11110"])
addchar("P", ["11110","10001","10001","11110","10000","10000","10000"])
addchar("T", ["11111","00100","00100","00100","00100","00100","00100"])
addchar("O", ["01110","10001","10001","10001","10001","10001","01110"])
addchar("R", ["11110","10001","10001","11110","10100","10010","10001"])
addchar("E", ["11111","10000","10000","11110","10000","10000","11111"])
addchar("C", ["01111","10000","10000","10000","10000","10000","01111"])
addchar("D", ["11110","10001","10001","10001","10001","10001","11110"])
addchar("A", ["01110","10001","10001","11111","10001","10001","10001"])
addchar("1", ["00100","01100","00100","00100","00100","00100","01110"])
addchar("2", ["01110","10001","00001","00010","00100","01000","11111"])
addchar("-", ["00000","00000","00000","11111","00000","00000","00000"])
addchar(" ", ["00000"] * 7)
addchar(":", ["00000","00100","00000","00000","00100","00000","00000"])
addchar("K", ["10001","10010","10100","11000","10100","10010","10001"])
addchar("M", ["10001","11011","10101","10101","10001","10001","10001"])
addchar("G", ["01111","10000","10000","10111","10001","10001","01111"])
addchar("U", ["10001","10001","10001","10001","10001","10001","01110"])
addchar("L", ["10000","10000","10000","10000","10000","10000","11111"])
addchar("V", ["10001","10001","10001","10001","10001","01010","00100"])
addchar("F", ["11111","10000","10000","11110","10000","10000","10000"])
addchar("0", ["01110","10001","10001","10001","10001","10001","01110"])
addchar("4", ["00100","01100","10100","11111","00100","00100","00100"])
addchar(".", ["00000","00000","00000","00000","00000","00100","00100"])
addchar("&", ["01010","10100","01010","00100","01010","10100","01010"])
addchar("3", ["01110","10001","00001","00110","00001","10001","01110"])
addchar("W", ["10001","10001","10001","10101","10101","10101","01010"])

def draw_text(img, x, y, text, scale=2, color=(0, 0, 0)):
    for i, c in enumerate(text.upper()):
        glyph = FONT.get(c, FONT[" "])
        for gy in range(7):
            for gx in range(5):
                if glyph[gy][gx] == "1":
                    fill_rect(img, x + gx * scale + i * 6 * scale, y + gy * scale,
                              x + gx * scale + i * 6 * scale + scale, y + gy * scale + scale, color)

W, H = 480, 320
img = blank(W, H)
fill_rect(img, 10, 10, W - 10, H - 10, (255, 255, 255))
fill_rect(img, 10, 10, W - 10, 40, (0, 0, 0))
draw_text(img, 20, 18, "MRPL INSPECTION SCAN", scale=2, color=(255, 255, 255))
draw_text(img, 20, 55, "TAG: 12-P-104", scale=3)
draw_text(img, 20, 90, "DATE: 2026-09-14", scale=2)
draw_text(img, 20, 120, "INSPECTOR: R KUMAR", scale=2)
fill_rect(img, 20, 160, W - 20, 162, (0, 0, 0))
draw_text(img, 20, 170, "STATUS: OK", scale=2)
draw_text(img, 20, 200, "FINDING: CALIBRATION OK", scale=2)
draw_text(img, 20, 230, "NO ANOMALIES", scale=2)
draw_text(img, 20, 270, "SIGNED: R KUMAR", scale=2)
write_png("data/samples/inspection_scan.png", W, H, img)
print("wrote inspection_scan.png")

W2, H2 = 480, 320
img2 = blank(W2, H2)
fill_rect(img2, 10, 10, W2 - 10, H2 - 10, (255, 255, 255))
draw_text(img2, 20, 18, "PID C3 CRUDE INLET", scale=2)
fill_rect(img2, 120, 70, 240, 200, (200, 200, 200))
draw_text(img2, 150, 120, "T-301", scale=2)
fill_rect(img2, 40, 130, 120, 134, (0, 0, 0))
fill_rect(img2, 240, 130, 400, 134, (0, 0, 0))
for (vx, vy) in [(80, 130), (280, 130), (360, 130)]:
    fill_rect(img2, vx - 6, vy - 6, vx + 6, vy + 6, (0, 0, 0))
    fill_rect(img2, vx - 6, vy - 6, vx + 6, vy + 6, (255, 255, 255))
    fill_rect(img2, vx - 2, vy - 6, vx + 2, vy + 6, (0, 0, 0))
    fill_rect(img2, vx - 6, vy - 2, vx + 6, vy + 2, (0, 0, 0))
fill_rect(img2, 200, 220, 240, 260, (0, 0, 0))
fill_rect(img2, 205, 225, 235, 255, (255, 255, 255))
draw_text(img2, 208, 230, "P", scale=2)
draw_text(img2, 20, 290, "12-P-104", scale=2)
write_png("data/samples/pid_c3.png", W2, H2, img2)
print("wrote pid_c3.png")
