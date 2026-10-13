"""Synthetic design screenshot for README examples; no personal task data."""
import cairo
from pathlib import Path
import sys
path = Path(sys.argv[1]);path.parent.mkdir(parents=True, exist_ok=True)
surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, 1080, 660)
c = cairo.Context(surface)
def rect(x,y,w,h,color):
    c.set_source_rgb(*color);c.rectangle(x,y,w,h);c.fill()
def text(x,y,value,size=24,color=(.92,.93,.97),bold=False):
    c.select_font_face('DejaVu Sans', cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD if bold else cairo.FONT_WEIGHT_NORMAL)
    c.set_font_size(size);c.set_source_rgb(*color);c.move_to(x,y);c.show_text(value)
rect(0,0,1080,660,(.075,.082,.11))
rect(0,0,220,660,(.105,.115,.15));text(34,64,'PROJECTS',19,(.91,.56,.36),True)
for y,label in [(140,'Overview'),(198,'Release board'),(256,'Activity'),(314,'Settings')]:
    if y==198:rect(20,y-34,180,50,(.21,.18,.19))
    text(36,y,label,20)
text(258,72,'Release board',32,bold=True);text(258,110,'A calm space for the next release.',20,(.57,.61,.69))
for x,title,count,accent in [(260,'Waiting','03',(.77,.55,.89)),(530,'In progress','02',(.48,.78,.61)),(800,'Done','04',(.88,.54,.35))]:
    text(x,174,title,21,accent,True);text(x+205,174,count,17,accent)
    for j,caption in enumerate(['Review permissions','Prepare release demo'] if x==260 else ['Polish task previews','Check keyboard flow'] if x==530 else ['Add date shortcuts','Ship inline images']):
        y=206+j*174;rect(x,y,238,146,(.14,.15,.2));rect(x+18,y+20,34,6,accent)
        words=caption.split();text(x+18,y+68,' '.join(words[:-1]),18,bold=True);text(x+18,y+96,words[-1],18,bold=True)
        text(x+18,y+127,'Release 0.4',14,(.53,.57,.66))
text(260,622,'Design review  /  Synthetic sample',17,(.5,.55,.64))
surface.write_to_png(str(path))
