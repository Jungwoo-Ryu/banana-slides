"""Test fixture: attach a local image to an API-created project (no AI)."""
import os, sqlite3, sys, uuid
from pathlib import Path
from PIL import Image, ImageDraw
root=Path(__file__).resolve().parents[1]
project_id,page_id=(str(uuid.UUID(x)) for x in sys.argv[1:3])
relative=f'{project_id}/pages/{page_id}_v1.png'
path=Path(os.getenv('UPLOAD_FOLDER', root/'uploads'))/relative
path.parent.mkdir(parents=True,exist_ok=True)
image=Image.new('RGB',(1280,720),'#10263e');draw=ImageDraw.Draw(image)
draw.rounded_rectangle((70,150,1210,570),radius=25,fill='#e9f3ff')
draw.text((140,240),'LOCAL BROWSER TEST',fill='#10263e',font_size=56)
draw.text((140,350),'Select a region. Edit with a prompt. Export PPTX.',fill='#10263e',font_size=30)
image.save(path)
with sqlite3.connect(os.getenv('DATABASE_PATH',root/'backend/instance/database.db')) as db:
    count=db.execute("UPDATE pages SET generated_image_path=?, status='COMPLETED' WHERE id=? AND project_id=?",(relative,page_id,project_id)).rowcount
    if count!=1: raise RuntimeError('Fixture page not found')
