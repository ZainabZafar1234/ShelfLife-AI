import os
import json
import sqlite3
from typing import List
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

app = FastAPI(title="ShelfLife AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = "shelflife.db"

IMPACT_METRICS = {
    "produce": {"co2Kg": 0.9, "costUsd": 2.5},
    "dairy": {"co2Kg": 3.2, "costUsd": 4.0},
    "meat": {"co2Kg": 6.5, "costUsd": 7.5},
    "grains": {"co2Kg": 1.1, "costUsd": 2.0},
    "other": {"co2Kg": 1.5, "costUsd": 3.0},
}

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            days_left INTEGER NOT NULL,
            quantity TEXT NOT NULL
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS impact (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            co2_saved REAL NOT NULL,
            money_saved REAL NOT NULL,
            items_rescued INTEGER NOT NULL
        )
    """)
    cursor.execute("SELECT COUNT(*) FROM impact")
    if cursor.fetchone()[0] == 0:
        cursor.execute("INSERT INTO impact (id, co2_saved, money_saved, items_rescued) VALUES (1, 14.2, 38.5, 9)")

    cursor.execute("SELECT COUNT(*) FROM inventory")
    if cursor.fetchone()[0] == 0:
        demo_items = [
            ("Baby Spinach", "produce", 1, "1 bag"),
            ("Chicken Breast", "meat", 2, "500g"),
            ("Heavy Cream", "dairy", 2, "200ml"),
            ("Cherry Tomatoes", "produce", 3, "1 pint"),
            ("Arborio Rice", "grains", 180, "1 box"),
        ]
        cursor.executemany("INSERT INTO inventory (name, category, days_left, quantity) VALUES (?, ?, ?, ?)", demo_items)

    conn.commit()
    conn.close()

init_db()

def get_gemini_client():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key or api_key == "your_actual_gemini_api_key_here":
        return None
    return genai.Client(api_key=api_key)

class ItemCreate(BaseModel):
    name: str
    category: str
    days_left: int
    quantity: str = "1 unit"

class ScannedItem(BaseModel):
    name: str
    category: str
    days_left: int
    quantity: str

class Recipe(BaseModel):
    title: str
    prepTime: str
    urgentUsed: List[str]
    steps: List[str]

@app.get("/api/state")
def get_state():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM inventory ORDER BY days_left ASC")
    items = [dict(row) for row in cursor.fetchall()]
    cursor.execute("SELECT co2_saved, money_saved, items_rescued FROM impact WHERE id = 1")
    impact = dict(cursor.fetchone())
    conn.close()
    return {"inventory": items, "impact": impact}

@app.post("/api/items")
def add_item(item: ItemCreate):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("INSERT INTO inventory (name, category, days_left, quantity) VALUES (?, ?, ?, ?)", 
                   (item.name, item.category, item.days_left, item.quantity))
    conn.commit()
    item_id = cursor.lastrowid
    conn.close()
    return {"id": item_id, **item.model_dump()}

@app.post("/api/items/{item_id}/rescue")
def rescue_item(item_id: int):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM inventory WHERE id = ?", (item_id,))
    item = cursor.fetchone()
    if not item:
        conn.close()
        raise HTTPException(status_code=404, detail="Item not found")

    metric = IMPACT_METRICS.get(item["category"], IMPACT_METRICS["other"])
    cursor.execute("""
        UPDATE impact 
        SET co2_saved = ROUND(co2_saved + ?, 1),
            money_saved = ROUND(money_saved + ?, 2),
            items_rescued = items_rescued + 1
        WHERE id = 1
    """, (metric["co2Kg"], metric["costUsd"]))
    cursor.execute("DELETE FROM inventory WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()
    return {"status": "rescued", "saved": metric}

@app.delete("/api/items/{item_id}")
def delete_item(item_id: int):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM inventory WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()
    return {"status": "deleted"}

@app.post("/api/scan")
async def scan_image(file: UploadFile = File(...)):
    client = get_gemini_client()
    if not client:
        raise HTTPException(status_code=400, detail="GEMINI_API_KEY is not configured in backend/.env")

    image_bytes = await file.read()
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type=file.content_type),
            ("Identify all edible grocery items in this fridge or receipt image. "
             "Classify category strictly as one of: produce, dairy, meat, grains, other. "
             "Estimate realistic remaining shelf life in days assuming refrigerated storage.")
        ],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=list[ScannedItem],
        ),
    )
    extracted = json.loads(response.text)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    for item in extracted:
        cursor.execute("INSERT INTO inventory (name, category, days_left, quantity) VALUES (?, ?, ?, ?)",
                       (item["name"], item["category"], item["days_left"], item["quantity"]))
    conn.commit()
    conn.close()
    return {"added": len(extracted), "items": extracted}

@app.post("/api/recipes")
def generate_recipes():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM inventory ORDER BY days_left ASC")
    items = [dict(row) for row in cursor.fetchall()]
    conn.close()

    if not items:
        return {"recipes": []}

    client = get_gemini_client()
    if not client:
        return {
            "recipes": [{
                "title": "Creamy Tuscan Chicken & Spinach Skillet",
                "prepTime": "20 mins",
                "urgentUsed": [i["name"] for i in items if i["days_left"] <= 3][:3],
                "steps": [
                    "Sear chicken breasts in a hot skillet until golden.",
                    "Blister cherry tomatoes in the pan and pour in heavy cream.",
                    "Fold in fresh baby spinach until wilted, return chicken, and serve."
                ]
            }]
        }

    urgent = [i for i in items if i["days_left"] <= 4]
    prompt = f"Create 2 zero-waste recipes using these available ingredients, prioritizing urgent ones:\nUrgent: {json.dumps(urgent)}\nAll: {json.dumps(items)}"
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=list[Recipe],
        ),
    )
    return {"recipes": json.loads(response.text)}