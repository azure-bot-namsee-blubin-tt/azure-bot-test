from PIL import Image, ImageDraw, ImageFont
import os

color_img = Image.new('RGB', (192, 192), color='#0078D4')
draw_color = ImageDraw.Draw(color_img)

draw_color.rectangle([60, 60, 132, 132], outline='white', width=3)
# Draw calculator buttons
for i in range(3):
    for j in range(3):
        x = 70 + i * 20
        y = 80 + j * 20
        draw_color.rectangle([x, y, x+15, y+15], outline='white', width=2)

color_img.save('appPackage/color.png')
print("Created color.png")

outline_img = Image.new('RGBA', (32, 32), color=(255, 255, 255, 0))
draw_outline = ImageDraw.Draw(outline_img)

draw_outline.rectangle([8, 8, 24, 24], outline='white', width=2)
for i in range(2):
    for j in range(2):
        x = 10 + i * 6
        y = 12 + j * 6
        draw_outline.rectangle([x, y, x+4, y+4], outline='white', width=1)

outline_img.save('appPackage/outline.png')
print("Created outline.png")

print("Icons created successfully!")
