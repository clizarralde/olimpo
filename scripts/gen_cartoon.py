import os, json, base64, urllib.request, urllib.error, sys, time
from io import BytesIO
from PIL import Image

KEY=None
for line in open('.env'):
    line=line.strip()
    if line.startswith('OPENAI_API_KEY'): KEY=line.split('=',1)[1].strip().strip('"').strip("'")
if not KEY: sys.exit("no OPENAI_API_KEY en .env")

CHAR=("the SAME friendly cartoon male gym mascot (simple round head, short dark hair, "
      "green sleeveless tank top, blue shorts, white sneakers, big happy smile)")
STYLE=("Flat vector illustration, bold clean black outlines, vibrant flat colors, full body, "
       "centered in each cell, identical character design and art style in every panel, "
       "no text, no numbers, no labels. 3x2 grid (3 columns, 2 rows) of six separate equal "
       "square panels on a pure white background, thin light gray lines separating the cells.")

POSES={
 "pectorales":["barbell bench press lying on a bench","incline dumbbell press","standing cable crossover",
   "pec-deck machine chest fly","flat dumbbell chest fly lying down","push-up on the floor"],
 "dorsales":["pull-up hanging from a bar","lat pulldown machine","bent-over barbell row",
   "seated cable row","one-arm dumbbell row on a bench","straight-arm cable pulldown"],
 "hombros":["standing barbell overhead press","seated dumbbell shoulder press","standing dumbbell lateral raise",
   "standing front dumbbell raise","bent-over reverse dumbbell fly","standing barbell shrug"],
 "triceps":["cable triceps pushdown","lying EZ-bar skullcrusher triceps extension","standing overhead dumbbell triceps extension",
   "bench dips","parallel bar dips","one-arm triceps dumbbell kickback"],
 "biceps":["standing barbell biceps curl","alternating dumbbell biceps curl","dumbbell hammer curl",
   "preacher curl on a bench","seated concentration curl","standing cable biceps curl"],
 "piernas":["barbell back squat","leg press machine","walking lunge holding dumbbells",
   "leg extension machine","lying leg curl machine","standing calf raise"],
}

def gen(group, poses, tries=3):
    items="; ".join(f"{i+1}) {p}" for i,p in enumerate(poses))
    prompt=(f"A grid of six panels. Each panel shows {CHAR} performing a different exercise, one per panel: "
            f"{items}. {STYLE}")
    body=json.dumps({"model":"gpt-image-1","prompt":prompt,"size":"1536x1024","quality":"medium","n":1}).encode()
    for t in range(tries):
        try:
            req=urllib.request.Request("https://api.openai.com/v1/images/generations",data=body,
                headers={"Authorization":"Bearer "+KEY,"Content-Type":"application/json"})
            r=urllib.request.urlopen(req,timeout=240)
            return json.loads(r.read())["data"][0]["b64_json"]
        except urllib.error.HTTPError as e:
            print(f"  [{group}] HTTP {e.code} (intento {t+1}):", e.read().decode()[:200]); time.sleep(5)
        except Exception as e:
            print(f"  [{group}] err {e} (intento {t+1})"); time.sleep(5)
    return None

cat={}
for e in json.load(open('data/catalog.seed.json'))['exercises']:
    cat.setdefault(e['muscleGroup'],[]).append(e['id'])

INSET=14  # recorta la línea de grilla
total=0
for group, poses in POSES.items():
    print("Generando", group, "...")
    b64=gen(group, poses)
    if not b64: print("  FALLO", group); continue
    img=Image.open(BytesIO(base64.b64decode(b64))).convert("RGBA")
    img.save(f"images/cartoon/_grid_{group}.png")
    W,H=img.size; cw,ch=W//3,H//2
    tiles=[]
    for r_ in range(2):
        for c_ in range(3):
            t=img.crop((c_*cw+INSET, r_*ch+INSET, (c_+1)*cw-INSET, (r_+1)*ch-INSET))
            tiles.append(t)
    ids=cat.get(group,[])
    for i,exid in enumerate(ids):
        tiles[i % len(tiles)].save(f"images/cartoon/m/{exid}.png")
        total+=1
    print(f"  OK {group}: {len(ids)} ejercicios asignados")
print("TOTAL imágenes asignadas:", total)
