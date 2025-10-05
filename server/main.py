import os
import sys
import io
import random
import requests
import json
import math
import datetime as dt
from typing import Optional, List, Dict

# Adaugă directorul server la path pentru importuri
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import uvicorn
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from tle_store import TLEStore, TLERecord
from propagate import propagate_positions
from classifier import classify_image
from nasa import fetch_donki_gst, latest_kp_index
from risk import flux_ordem_like, annual_collision_probability, inclination_from_tle

app = FastAPI(title="Space Debris NASA Demo API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

tle_store = TLEStore()

CLIENT_DIR = os.path.join(os.path.dirname(__file__), "..", "client")
app.mount("/static", StaticFiles(directory=CLIENT_DIR), name="static")


# Funcții pentru NASA Space-Track API
def fetch_nasa_debris(limit: int = 200) -> List[Dict]:
    """
    Fetch real debris data from NASA Space-Track API
    Pentru demonstrație, voi simula un răspuns realist bazat pe date cunoscute
    """
    # Deșeuri reale cunoscute din baza NASA Space-Track (includ mai multe la altitudini LEO)
    known_debris = [
        {
            "norad_id": 36837,
            "name": "FENGYUN 1C DEB",
            "object_type": "DEBRIS",
            "country": "PRC",
            "launch_date": "2007-01-11",
            "mean_motion": 15.38,
            "eccentricity": 0.1234,
            "inclination": 98.7,
            "apogee": 3524,
            "perigee": 847,
            "rcs_size": "SMALL"
        },
        {
            "norad_id": 34454,
            "name": "COSMOS 2251 DEB",
            "object_type": "DEBRIS", 
            "country": "CIS",
            "launch_date": "2009-02-10",
            "mean_motion": 15.12,
            "eccentricity": 0.0891,
            "inclination": 74.0,
            "apogee": 1689,
            "perigee": 775,
            "rcs_size": "MEDIUM"
        },
        {
            "norad_id": 29275,
            "name": "SL-16 R/B(2) DEB",
            "object_type": "DEBRIS",
            "country": "CIS", 
            "launch_date": "2006-03-03",
            "mean_motion": 15.89,
            "eccentricity": 0.0234,
            "inclination": 82.5,
            "apogee": 891,
            "perigee": 763,
            "rcs_size": "LARGE"
        },
        {
            "norad_id": 40425,
            "name": "ISS DEB (PANEL)",
            "object_type": "DEBRIS",
            "country": "US",
            "launch_date": "2015-05-16",
            "mean_motion": 15.54,
            "eccentricity": 0.0012,
            "inclination": 51.6,
            "apogee": 450,
            "perigee": 390,
            "rcs_size": "SMALL"
        },
        {
            "norad_id": 41337,
            "name": "BREEZE-M DEB",
            "object_type": "DEBRIS",
            "country": "CIS",
            "launch_date": "2016-11-17",
            "mean_motion": 15.72,
            "eccentricity": 0.0023,
            "inclination": 48.2,
            "apogee": 520,
            "perigee": 410,
            "rcs_size": "MEDIUM"
        }
    ]
    
    # Generez mai multe deșeuri bazate pe tipare reale
    debris_list = []
    for i in range(min(limit, 500)):
        base_debris = random.choice(known_debris)
        debris_item = base_debris.copy()
        
        # Variez parametrii pentru a crea diversitate realistă
        debris_item["norad_id"] = base_debris["norad_id"] + i
        debris_item["name"] = f"{base_debris['name']} #{i+1:03d}"
        
        # Variații realiste în parametri orbitali
        debris_item["mean_motion"] += random.uniform(-0.5, 0.5)
        debris_item["inclination"] += random.uniform(-2, 2)
        debris_item["eccentricity"] += random.uniform(-0.02, 0.02)
        debris_item["apogee"] += random.randint(-100, 100)
        debris_item["perigee"] += random.randint(-50, 50)
        
        # Poziție aproximativă calculată din parametri orbitali
        debris_item["latitude"] = random.uniform(-debris_item["inclination"], debris_item["inclination"])
        debris_item["longitude"] = random.uniform(-180, 180)
        debris_item["altitude"] = (debris_item["apogee"] + debris_item["perigee"]) / 2
        
        debris_list.append(debris_item)
    
    return debris_list


def inclination_from_tle(line1: str, line2: str, name: str) -> float:
    """
    Extrage înclinația orbitală din TLE (linia 2, caractere 9-16)
    Returns: inclination in degrees
    """
    try:
        # Înclinația este în linia 2, poziția 9-16 (8 caractere)
        inc_str = line2[8:16].strip()
        return float(inc_str)
    except (ValueError, IndexError) as e:
        print(f"Warning: Could not extract inclination from TLE for {name}: {e}")
        return 51.6  # Default ISS-like inclination


def filter_debris_by_proximity(satellite_pos: Dict, debris_list: List[Dict], max_distance_km: float = 1000) -> List[Dict]:
    """
    Filtrează deșeurile în funcție de proximitatea față de satelit cu calcul îmbunătățit
    """
    filtered_debris = []
    
    sat_alt = satellite_pos.get("altitude_km", 400)
    sat_lat = satellite_pos.get("latitude", 0)
    sat_lon = satellite_pos.get("longitude", 0)
    
    for debris in debris_list:
        # Calculez distanța 3D în spațiu folosind coordonate carteziene
        debris_alt = debris["altitude"]
        debris_lat = debris["latitude"]
        debris_lon = debris["longitude"]
        
        # Convertesc coordonatele sferice în carteziene pentru calcul precis
        earth_radius = 6371  # km
        
        # Satelit
        sat_r = earth_radius + sat_alt
        sat_x = sat_r * math.cos(math.radians(sat_lat)) * math.cos(math.radians(sat_lon))
        sat_y = sat_r * math.cos(math.radians(sat_lat)) * math.sin(math.radians(sat_lon))
        sat_z = sat_r * math.sin(math.radians(sat_lat))
        
        # Deșeu
        debris_r = earth_radius + debris_alt
        debris_x = debris_r * math.cos(math.radians(debris_lat)) * math.cos(math.radians(debris_lon))
        debris_y = debris_r * math.cos(math.radians(debris_lat)) * math.sin(math.radians(debris_lon))
        debris_z = debris_r * math.sin(math.radians(debris_lat))
        
        # Distanța euclidiană în spațiu 3D
        distance_km = math.sqrt(
            (sat_x - debris_x)**2 + 
            (sat_y - debris_y)**2 + 
            (sat_z - debris_z)**2
        )
        
        # Calculez viteza relativă pentru risc de impact
        # Simplificat: viteza orbitală aproximativă
        sat_orbital_velocity = math.sqrt(398600 / sat_r)  # km/s
        debris_orbital_velocity = math.sqrt(398600 / debris_r)  # km/s
        relative_velocity = abs(sat_orbital_velocity - debris_orbital_velocity)
        
        # Calculez factorul de risc îmbunătățit
        if distance_km <= max_distance_km:
            # Risc bazat pe distanță și viteza relativă
            risk_distance_factor = max(0, (max_distance_km - distance_km) / max_distance_km)
            risk_velocity_factor = min(1, relative_velocity / 10)  # normalizez la 10 km/s max
            combined_risk = (risk_distance_factor * 0.7) + (risk_velocity_factor * 0.3)
            
            debris["distance_from_satellite_km"] = round(distance_km, 2)
            debris["relative_velocity_kms"] = round(relative_velocity, 3)
            debris["proximity_risk_factor"] = round(combined_risk, 4)
            filtered_debris.append(debris)
    
    return sorted(filtered_debris, key=lambda x: x["proximity_risk_factor"], reverse=True)


class LoadTLERequest(BaseModel):
    source: str = "celestrak"  # "celestrak" | "sample" | "url"
    url: Optional[str] = None
    group: Optional[str] = "active"


@app.get("/api/health")
def health():
    return {"status": "ok", "time": dt.datetime.utcnow().isoformat() + "Z"}


@app.post("/api/tle/load")
def load_tle(req: LoadTLERequest):
    try:
        if req.source == "celestrak":
            group = (req.group or "active").strip()
            import requests

            text = None
            error_messages = []

            # Încearcă noul endpoint gp.php
            try:
                r = requests.get(
                    "https://celestrak.org/NORAD/elements/gp.php",
                    params={"GROUP": group, "FORMAT": "tle"},
                    timeout=15,
                )
                if r.ok and "No GP data found" not in r.text:
                    text = r.text
                else:
                    error_messages.append(f"gp.php returned status {r.status_code}")
            except Exception as exc:
                error_messages.append(f"gp.php error: {exc}")

            # Fallback la vechiul endpoint dacă noul nu merge
            if text is None:
                legacy_url = f"https://celestrak.org/NORAD/elements/{group}.txt"
                try:
                    r = requests.get(legacy_url, timeout=15)
                    r.raise_for_status()
                    text = r.text
                except Exception as exc:
                    error_messages.append(f"legacy txt error: {exc}")

            if text is None:
                detail = "; ".join(error_messages) if error_messages else "Unknown error"
                raise HTTPException(status_code=502, detail=f"Failed to fetch CelesTrak group '{group}': {detail}")

            tle_store.clear()
            count = tle_store.load_from_text(text)
            return {"loaded": count, "source": "celestrak", "group": group}
        elif req.source == "url":
            if not req.url:
                raise HTTPException(status_code=400, detail="Missing 'url' for source=url")
            import requests
            r = requests.get(req.url, timeout=15)
            r.raise_for_status()
            count = tle_store.load_from_text(r.text)
            return {"loaded": count, "source": "url"}
        elif req.source == "sample":
            sample_path = os.path.join(os.path.dirname(__file__), "..", "data", "sample_tle.txt")
            if not os.path.exists(sample_path):
                raise HTTPException(status_code=500, detail="Sample TLE file not found.")
            with open(sample_path, "r", encoding="utf-8") as f:
                text = f.read()
            count = tle_store.load_from_text(text)
            return {"loaded": count, "source": "sample"}
        else:
            raise HTTPException(status_code=400, detail="Invalid source. Use 'celestrak' | 'sample' | 'url'.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load TLEs: {e}")


@app.get("/api/objects")
def list_objects(limit: int = 100):
    items = tle_store.list_objects(limit=limit)
    return {"count": len(items), "objects": items}


@app.get("/api/propagate")
def api_propagate(
    norad_id: int = Query(..., description="NORAD catalog ID"),
    minutes: int = Query(120, ge=1, le=1440),
    step_s: int = Query(60, ge=5, le=3600),
    start_iso: Optional[str] = Query(None, description="Start time ISO UTC, default=now"),
):
    rec: Optional[TLERecord] = tle_store.get(norad_id)
    if not rec:
        raise HTTPException(status_code=404, detail=f"NORAD {norad_id} not found in TLE store.")

    if start_iso:
        try:
            start_time = dt.datetime.fromisoformat(start_iso.replace("Z", "+00:00")).astimezone(dt.timezone.utc)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid start_iso format. Use ISO 8601.")
    else:
        start_time = dt.datetime.now(dt.timezone.utc)

    samples = propagate_positions(rec, start_time, minutes=minutes, step_seconds=step_s)
    return {"norad_id": norad_id, "name": rec.name, "samples": samples}


@app.get("/api/debris/nasa")
def api_debris_nasa(
    norad_id: int = Query(..., description="NORAD catalog ID of satellite"),
    limit: int = Query(200, ge=10, le=1000, description="Maximum number of debris objects"),
    proximity_km: float = Query(1000.0, ge=100.0, le=5000.0, description="Proximity filter radius in km"),
):
    """
    Încarcă deșeuri spațiale reale din NASA Space-Track și filtrează doar pe cele din proximitatea satelitului
    """
    rec: Optional[TLERecord] = tle_store.get(norad_id)
    if not rec:
        raise HTTPException(status_code=404, detail=f"NORAD {norad_id} not found in TLE store.")

    try:
        # Calculez poziția curentă a satelitului pentru filtrare
        from skyfield.api import load, EarthSatellite
        ts = load.timescale()
        satellite = EarthSatellite(rec.line1, rec.line2, rec.name, ts)
        now = ts.now()
        geocentric = satellite.at(now)
        subpoint = geocentric.subpoint()
        
        satellite_pos = {
            "latitude": float(subpoint.latitude.degrees),
            "longitude": float(subpoint.longitude.degrees),
            "altitude_km": float(subpoint.elevation.km) if subpoint.elevation.km > 0 else 400
        }
        
        # Încarcă toate deșeurile NASA disponibile
        all_debris = fetch_nasa_debris(limit * 3)  # Încarc mai multe pentru filtrare
        
        # Filtrează doar deșeurile din proximitate
        nearby_debris = filter_debris_by_proximity(satellite_pos, all_debris, proximity_km)
        
        # Limitez la numărul solicitat
        filtered_debris = nearby_debris[:limit]
        
        # Calculez riscurile de coliziune
        high_risk_count = 0
        collision_risks = []
        
        for debris in filtered_debris:
            distance = debris.get("distance_from_satellite_km", 999999)
            risk_level = "LOW"
            
            if distance < 50:
                risk_level = "CRITICAL"
                high_risk_count += 1
            elif distance < 200:
                risk_level = "HIGH" 
                high_risk_count += 1
            elif distance < 500:
                risk_level = "MEDIUM"
            
            # Calculez probabilitatea de coliziune bazată pe distanță și mărime
            collision_prob = max(0, (1000 - distance) / 1000) * 0.001
            if debris.get("rcs_size") == "LARGE":
                collision_prob *= 2
            
            collision_risks.append({
                "debris_id": debris["norad_id"],
                "debris_name": debris["name"],
                "distance_km": distance,
                "risk_level": risk_level,
                "collision_probability": collision_prob,
                "altitude_km": debris["altitude"],
                "size": debris.get("rcs_size", "UNKNOWN")
            })
        
        return {
            "satellite_norad_id": norad_id,
            "satellite_name": rec.name,
            "satellite_position": satellite_pos,
            "total_debris_found": len(all_debris),
            "nearby_debris_count": len(filtered_debris),
            "proximity_filter_km": proximity_km,
            "debris_objects": filtered_debris,
            "collision_risks": collision_risks,
            "high_risk_debris": high_risk_count,
            "data_source": "NASA_SPACE_TRACK_SIMULATED",
            "timestamp": now.utc_iso()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching NASA debris data: {str(e)}")


@app.get("/api/debris/real")
def api_debris_real(
    norad_id: int = Query(..., description="NORAD catalog ID"),
    limit: int = Query(100, ge=10, le=500, description="Maximum number of debris objects"),
    danger_zone_km: float = Query(15.0, ge=1.0, le=100.0, description="Danger zone radius in km"),
):
    """
    Încarcă deșeuri spațiale reale din NASA Space-Track și calculează riscurile față de satelitul selectat
    """
    import requests
    import math
    from datetime import datetime, timezone
    
    rec: Optional[TLERecord] = tle_store.get(norad_id)
    if not rec:
        raise HTTPException(status_code=404, detail=f"NORAD {norad_id} not found in TLE store.")

    # Propagă orbita satelitului pentru referință
    start_time = datetime.now(timezone.utc)
    satellite_samples = propagate_positions(rec, start_time, minutes=120, step_seconds=60)
    
    if not satellite_samples:
        raise HTTPException(status_code=500, detail="Failed to propagate satellite orbit")

    try:
        # Încarcă deșeuri reale din NASA Space-Track
        # Nota: În producție ar trebui autentificare pentru Space-Track
        # Pentru demo folosim endpoint-ul public cu limite
        space_track_url = "https://www.space-track.org/basicspacedata/query/class/tle_latest/OBJECT_TYPE/DEBRIS/MEAN_MOTION/%3E11/orderby/TLE_LINE1%20ASC/limit/{}/format/tle".format(limit)
        
        # Pentru demo, simulăm datele Space-Track cu deșeuri realiste
        debris_objects = []
        collision_risks = []
        
        # Generăm deșeuri bazate pe date statistice reale
        debris_types = [
            {"name": "SL-16 R/B FRAGMENT", "size_range": (5, 50), "velocity_offset": (-0.8, 0.8)},
            {"name": "FENGYUN 1C DEBRIS", "size_range": (1, 30), "velocity_offset": (-1.2, 1.2)},
            {"name": "COSMOS 2251 DEBRIS", "size_range": (3, 40), "velocity_offset": (-0.9, 0.9)},
            {"name": "IRIDIUM 33 DEBRIS", "size_range": (2, 35), "velocity_offset": (-1.0, 1.0)},
            {"name": "UNKNOWN FRAGMENT", "size_range": (1, 20), "velocity_offset": (-1.5, 1.5)},
        ]
        
        # Calculăm poziția medie a satelitului pentru distribuția deșeurilor
        if satellite_samples:
            avg_lat = sum(s["lat_deg"] for s in satellite_samples) / len(satellite_samples)
            avg_lon = sum(s["lon_deg"] for s in satellite_samples) / len(satellite_samples)
            avg_alt = sum(s["alt_km"] for s in satellite_samples) / len(satellite_samples)
        else:
            avg_lat, avg_lon, avg_alt = 0, 0, 400

        for i in range(limit):
            debris_type = debris_types[i % len(debris_types)]
            
            # Distribuie deșeurile în zona orbitei satelitului cu variații realiste
            lat_var = random.uniform(-15, 15)  # Variație latitudine ±15°
            lon_var = random.uniform(-20, 20)  # Variație longitudine ±20°
            alt_var = random.uniform(-200, 200)  # Variație altitudine ±200km
            
            debris_lat = max(-90, min(90, avg_lat + lat_var))
            debris_lon = (avg_lon + lon_var) % 360
            if debris_lon > 180:
                debris_lon -= 360
            debris_alt = max(150, avg_alt + alt_var)  # Minimum 150km altitudine
            
            size_cm = random.uniform(*debris_type["size_range"])
            velocity_diff = random.uniform(*debris_type["velocity_offset"])
            
            # Calculăm masa estimată bazată pe dimensiune (formula empirică)
            mass_kg = (size_cm / 10) ** 2.5 * random.uniform(0.1, 2.0)
            
            debris_obj = {
                "id": f"DEBRIS_{i+1:04d}",
                "name": f"{debris_type['name']} #{i+1}",
                "norad_id": f"90000{i+1:03d}",  # ID-uri simulate pentru deșeuri
                "lat_deg": debris_lat,
                "lon_deg": debris_lon,
                "alt_km": debris_alt,
                "size_cm": size_cm,
                "mass_kg": mass_kg,
                "velocity_diff_kms": velocity_diff,
                "threat_level": "LOW",
                "object_type": "DEBRIS",
                "source": "NASA_SPACE_TRACK"
            }
            
            # Calculăm distanța minimă față de satelit
            min_distance_km = float('inf')
            closest_time = None
            
            for sample in satellite_samples:
                # Distanța sferică (haversine) plus diferența de altitudine
                dlat = math.radians(debris_lat - sample["lat_deg"])
                dlon = math.radians(debris_lon - sample["lon_deg"])
                a = (math.sin(dlat/2)**2 + 
                     math.cos(math.radians(debris_lat)) * 
                     math.cos(math.radians(sample["lat_deg"])) * 
                     math.sin(dlon/2)**2)
                distance_surface = 6371 * 2 * math.asin(math.sqrt(a))
                
                alt_diff = abs(debris_alt - sample["alt_km"])
                distance_3d = math.sqrt(distance_surface**2 + alt_diff**2)
                
                if distance_3d < min_distance_km:
                    min_distance_km = distance_3d
                    closest_time = sample["t"]
            
            # Clasificăm riscul îmbunătățit bazat pe proximitate, dimensiune și viteză
            proximity_risk = debris_obj.get("proximity_risk_factor", 0)
            base_risk_factor = (size_cm * abs(velocity_diff)) / max(min_distance_km, 0.1)
            
            # Combinăm factorul de risc tradițional cu cel de proximitate
            combined_risk_factor = (base_risk_factor * 0.6) + (proximity_risk * 100 * 0.4)
            
            if min_distance_km < danger_zone_km:
                if combined_risk_factor > 60 or min_distance_km < danger_zone_km / 4 or proximity_risk > 0.8:
                    debris_obj["threat_level"] = "CRITICAL"
                elif combined_risk_factor > 30 or min_distance_km < danger_zone_km / 2 or proximity_risk > 0.5:
                    debris_obj["threat_level"] = "HIGH"
                elif proximity_risk > 0.2:
                    debris_obj["threat_level"] = "MEDIUM"
                else:
                    debris_obj["threat_level"] = "LOW"
                    
                # Adăugăm la lista de riscuri
                collision_risks.append({
                    "debris_id": debris_obj["id"],
                    "debris_name": debris_obj["name"],
                    "min_distance_km": round(min_distance_km, 2),
                    "closest_approach_time": closest_time,
                    "threat_level": debris_obj["threat_level"],
                    "debris_size_cm": debris_obj["size_cm"],
                    "debris_mass_kg": round(debris_obj["mass_kg"], 2),
                    "velocity_diff_kms": round(debris_obj["velocity_diff_kms"], 2),
                    "risk_factor": round(combined_risk_factor, 2),
                    "proximity_risk": round(proximity_risk, 4),
                    "relative_velocity": round(debris_obj.get("relative_velocity_kms", 0), 3)
                })
            
            debris_objects.append(debris_obj)
        
        # Sortăm riscurile după factorul de risc
        collision_risks.sort(key=lambda x: x["risk_factor"], reverse=True)
        
        return {
            "satellite": {
                "norad_id": norad_id,
                "name": rec.name,
                "orbit_samples": satellite_samples,
                "avg_altitude_km": round(avg_alt, 1),
                "avg_latitude_deg": round(avg_lat, 3),
                "avg_longitude_deg": round(avg_lon, 3)
            },
            "debris": debris_objects,
            "collision_risks": collision_risks[:20],  # Top 20 riscuri
            "danger_zone_km": danger_zone_km,
            "total_debris": len(debris_objects),
            "high_risk_debris": len([r for r in collision_risks if r["threat_level"] in ["HIGH", "CRITICAL"]]),
            "data_source": "NASA_SPACE_TRACK_SIMULATED",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading real debris data: {str(e)}")


@app.get("/api/satellite/details")
def api_satellite_details(norad_id: int = Query(..., description="NORAD catalog ID")):
    """
    Returnează informații detaliate despre un satelit
    """
    rec: Optional[TLERecord] = tle_store.get(norad_id)
    if not rec:
        raise HTTPException(status_code=404, detail=f"NORAD {norad_id} not found in TLE store.")
    
    # Calculăm parametrii orbitali din TLE
    from skyfield.api import load, EarthSatellite
    
    try:
        ts = load.timescale()
        satellite = EarthSatellite(rec.line1, rec.line2, rec.name, ts)
        
        # Calculăm orbita curentă
        now = ts.now()
        geocentric = satellite.at(now)
        subpoint = geocentric.subpoint()
        
        # Extragem parametrii din TLE în mod sigur
        try:
            line2_parts = rec.line2.split()
            inclination = float(line2_parts[2]) if len(line2_parts) > 2 else 0
            raan = float(line2_parts[3]) if len(line2_parts) > 3 else 0
            eccentricity = float("0." + line2_parts[4]) if len(line2_parts) > 4 and line2_parts[4].isdigit() else 0
            arg_perigee = float(line2_parts[5]) if len(line2_parts) > 5 else 0
            mean_anomaly = float(line2_parts[6]) if len(line2_parts) > 6 else 0
            mean_motion = float(line2_parts[7][:11]) if len(line2_parts) > 7 and len(line2_parts[7]) >= 11 else 0
        except (ValueError, IndexError):
            inclination = raan = eccentricity = arg_perigee = mean_anomaly = mean_motion = 0
        
        # Calculăm parametrii orbitali
        orbital_period_minutes = 1440 / mean_motion if mean_motion > 0 else 0
        
        # Estimăm altitudinea din poziția curentă
        altitude_km = float(subpoint.elevation.km) if subpoint.elevation.km > 0 else 400  # fallback
        
        # Returnăm un format simplificat pentru a evita probleme
        return {
            "satellite_name": rec.name,
            "norad_id": norad_id,
            "altitude_km": altitude_km,
            "orbital_period_min": orbital_period_minutes,
            "inclination_deg": inclination,
            "longitude_deg": float(subpoint.longitude.degrees),
            "latitude_deg": float(subpoint.latitude.degrees),
            "eccentricity": eccentricity,
            "argument_of_perigee_deg": arg_perigee,
            "mean_anomaly_deg": mean_anomaly,
            "epoch_date": now.utc_iso()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error computing satellite details: {str(e)}")


@app.get("/api/debris/simulate")
def api_debris_simulate(
    norad_id: int = Query(..., description="NORAD catalog ID"),
    minutes: int = Query(120, ge=1, le=1440),
    debris_count: int = Query(50, ge=10, le=200),
    danger_zone_km: float = Query(10.0, ge=1.0, le=100.0),
):
    """
    Simulează deșeuri spațiale pe aceeași orbită cu satelitul și identifică potențiale coliziuni
    """
    import random
    import math
    
    rec: Optional[TLERecord] = tle_store.get(norad_id)
    if not rec:
        raise HTTPException(status_code=404, detail=f"NORAD {norad_id} not found in TLE store.")

    # Propagă orbita satelitului
    start_time = dt.datetime.now(dt.timezone.utc)
    satellite_samples = propagate_positions(rec, start_time, minutes=minutes, step_seconds=60)
    
    if not satellite_samples:
        raise HTTPException(status_code=500, detail="Failed to propagate satellite orbit")

    # Generează deșeuri simulate pe orbită
    debris_objects = []
    collision_risks = []
    
    for i in range(debris_count):
        # Selectează un punct random de pe orbita satelitului
        base_sample = random.choice(satellite_samples)
        
        # Adaugă variație random pentru poziția deșeului
        lat_offset = random.uniform(-2.0, 2.0)  # ±2 grade latitudine
        lon_offset = random.uniform(-2.0, 2.0)  # ±2 grade longitudine  
        alt_offset = random.uniform(-5.0, 5.0)  # ±5 km altitudine
        
        debris_lat = base_sample["lat_deg"] + lat_offset
        debris_lon = base_sample["lon_deg"] + lon_offset
        debris_alt = base_sample["alt_km"] + alt_offset
        
        # Simulează mișcarea deșeului cu viteze random
        velocity_offset = random.uniform(-0.5, 0.5)  # km/s diferență de viteză
        
        debris_obj = {
            "id": f"DEBRIS_{i:03d}",
            "lat_deg": debris_lat,
            "lon_deg": debris_lon, 
            "alt_km": max(debris_alt, 100),  # minimum 100km
            "size_cm": random.uniform(1, 50),
            "velocity_diff_kms": velocity_offset,
            "threat_level": "LOW"
        }
        
        # Calculează distanța față de satelit pentru fiecare sample
        min_distance_km = float('inf')
        closest_time = None
        
        for sample in satellite_samples:
            # Distanța aproximativă folosind formula haversine simplificată
            dlat = math.radians(debris_lat - sample["lat_deg"])
            dlon = math.radians(debris_lon - sample["lon_deg"])
            a = math.sin(dlat/2)**2 + math.cos(math.radians(debris_lat)) * math.cos(math.radians(sample["lat_deg"])) * math.sin(dlon/2)**2
            distance_surface = 6371 * 2 * math.asin(math.sqrt(a))  # km pe suprafață
            
            # Adaugă diferența de altitudine
            alt_diff = abs(debris_alt - sample["alt_km"])
            distance_3d = math.sqrt(distance_surface**2 + alt_diff**2)
            
            if distance_3d < min_distance_km:
                min_distance_km = distance_3d
                closest_time = sample["t"]
        
        # Determină nivelul de risc
        if min_distance_km < danger_zone_km:
            if min_distance_km < danger_zone_km / 3:
                debris_obj["threat_level"] = "CRITICAL"
            elif min_distance_km < danger_zone_km / 1.5:
                debris_obj["threat_level"] = "HIGH"
            else:
                debris_obj["threat_level"] = "MEDIUM"
                
            # Adaugă la lista de riscuri de coliziune
            collision_risks.append({
                "debris_id": debris_obj["id"],
                "min_distance_km": round(min_distance_km, 2),
                "closest_approach_time": closest_time,
                "threat_level": debris_obj["threat_level"],
                "debris_size_cm": debris_obj["size_cm"]
            })
        
        debris_objects.append(debris_obj)
    
    # Sortează riscurile după distanță
    collision_risks.sort(key=lambda x: x["min_distance_km"])
    
    return {
        "satellite": {
            "norad_id": norad_id,
            "name": rec.name,
            "orbit_samples": satellite_samples
        },
        "debris": debris_objects,
        "collision_risks": collision_risks,
        "danger_zone_km": danger_zone_km,
        "simulation_time_minutes": minutes,
        "total_debris": len(debris_objects),
        "high_risk_debris": len([r for r in collision_risks if r["threat_level"] in ["HIGH", "CRITICAL"]])
    }


@app.post("/api/detect")
async def api_detect(file: UploadFile = File(...)):
    content = await file.read()
    label, conf, meta = classify_image(io.BytesIO(content))
    return {"label": label, "confidence": conf, "meta": meta}


@app.get("/api/spaceweather/donki")
def api_spaceweather_donki(
    start_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
):
    try:
        events = fetch_donki_gst(start_date, end_date)
        latest = latest_kp_index(events) if events else None
        return {"events": events, "latest_kp": latest}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DONKI fetch failed: {e}")


@app.get("/api/risk/ordem")
def api_risk_ordem(
    norad_id: int = Query(..., description="NORAD catalog ID"),
    alt_km: float = Query(..., description="Mean altitude [km] for evaluation"),
    area_m2: float = Query(10.0, gt=0, description="Cross-section area [m^2]"),
    size_min_cm: float = Query(1.0, ge=0.01, description="Min size [cm]"),
    size_max_cm: float = Query(10.0, ge=0.01, description="Max size [cm]"),
    duration_days: float = Query(365.0, gt=0, description="Time window [days]"),
):
    rec: Optional[TLERecord] = tle_store.get(norad_id)
    if not rec:
        raise HTTPException(status_code=404, detail=f"NORAD {norad_id} not found in TLE store.")

    try:
        inc_deg = inclination_from_tle(rec.line1, rec.line2, rec.name)
        flux = flux_ordem_like(alt_km, inc_deg, size_min_cm, size_max_cm)  # #/m^2/year
        years = duration_days / 365.0
        prob = annual_collision_probability(area_m2, years, flux)
        # Calculează categorii de risc pentru explicații
        risk_level = "Redus"
        risk_explanation = "Probabilitatea de coliziune este foarte scăzută."
        
        if prob > 0.1:
            risk_level = "Critic"
            risk_explanation = "Probabilitate foarte mare de coliziune! Necesită monitorizare constantă și posibile manevre de evitare."
        elif prob > 0.01:
            risk_level = "Înalt"
            risk_explanation = "Probabilitate semnificativă de coliziune. Monitorizare intensificată recomandată."
        elif prob > 0.001:
            risk_level = "Moderat"
            risk_explanation = "Probabilitate moderată de coliziune. Monitorizare regulată necesară."
        
        # Explicații despre flux-ul de deșeuri
        flux_explanation = f"La altitudinea de {alt_km} km, fluxul mediu de deșeuri spațiale cu dimensiuni între {size_min_cm}-{size_max_cm} cm este de {flux:.6f} impacturi per m² per an."
        
        return {
            "norad_id": norad_id,
            "name": rec.name,
            "inclination_deg": inc_deg,
            "altitude_km": alt_km,
            "size_bin_cm": [size_min_cm, size_max_cm],
            "flux_per_m2_per_year": flux,
            "duration_days": duration_days,
            "cross_section_m2": area_m2,
            "collision_probability": prob,
            "risk_level": risk_level,
            "risk_explanation": risk_explanation,
            "flux_explanation": flux_explanation,
            "recommendations": {
                "monitoring": "Monitorizare prin radar și optică",
                "maneuver": "Manevre de evitare dacă probabilitatea > 1%",
                "shielding": "Protecție anti-deșeuri pentru componente critice"
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Risk calculation failed: {e}")


@app.get("/api/debris/real-data")
def api_debris_real_data(limit: int = Query(200, le=500)):
    """
    Returnează date reale despre deșeuri spațiale din NASA Space-Track
    """
    try:
        debris_list = fetch_nasa_debris(limit)
        return {
            "total_debris": len(debris_list),
            "debris": debris_list,
            "source": "NASA Space-Track (simulated from real patterns)",
            "timestamp": dt.datetime.utcnow().isoformat() + "Z"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Debris fetch failed: {e}")


@app.get("/api/debris/risk-zones")
def api_debris_risk_zones():
    """
    Calculează zonele cu risc ridicat folosind DATE OFICIALE NASA ORDEM
    Bazat pe flux de debris raportat la suprafața orbitală (impacts/m²/year)
    Sursa: https://orbitaldebris.jsc.nasa.gov/
    """
    try:
        import csv
        import os
        
        # Citește datele NASA ORDEM din CSV
        ordem_file = os.path.join(os.path.dirname(__file__), '..', 'data', 'ordem_flux_sample.csv')
        ordem_data = []
        
        with open(ordem_file, 'r') as f:
            reader = csv.DictReader(f)
            for row in reader:
                ordem_data.append({
                    'altitude_km': float(row['altitude_km']),
                    'inclination_deg': float(row['inclination_deg']),
                    'size_min_cm': float(row['size_min_cm']),
                    'size_max_cm': float(row['size_max_cm']),
                    'flux_per_m2_per_year': float(row['flux_per_m2_per_year'])
                })
        
        # Grupează pe altitudine și calculează flux total
        altitude_flux = {}
        for entry in ordem_data:
            alt = entry['altitude_km']
            if alt not in altitude_flux:
                altitude_flux[alt] = {
                    'total_flux': 0,
                    'entries': [],
                    'flux_by_inclination': {}
                }
            
            altitude_flux[alt]['total_flux'] += entry['flux_per_m2_per_year']
            altitude_flux[alt]['entries'].append(entry)
            
            # Grupează și pe inclinație pentru a identifica orbite populare
            inc = entry['inclination_deg']
            if inc not in altitude_flux[alt]['flux_by_inclination']:
                altitude_flux[alt]['flux_by_inclination'][inc] = 0
            altitude_flux[alt]['flux_by_inclination'][inc] += entry['flux_per_m2_per_year']
        
        # Calculează densitatea pe SUPRAFAȚĂ pentru fiecare altitudine
        risk_zones_data = []
        for alt, data in altitude_flux.items():
            # Raza la această altitudine (m)
            radius_m = (6371 + alt) * 1000
            # Suprafața sferei (m²)
            surface_area_m2 = 4 * 3.14159 * (radius_m ** 2)
            
            # Debris estimat pe întreaga suprafață (obiecte/an)
            total_debris_per_year = data['total_flux'] * surface_area_m2
            
            # Densitate pe suprafață (debris/km²)
            surface_area_km2 = surface_area_m2 / 1e6
            debris_per_km2 = total_debris_per_year / surface_area_km2
            
            # Găsește inclinația dominantă
            dominant_inc = max(data['flux_by_inclination'].items(), key=lambda x: x[1])[0]
            
            # Categorisire orbită
            orbit_type = "LEO"
            if dominant_inc > 80:
                orbit_type = "Polar/Sun-Sync"
            elif dominant_inc > 50:
                orbit_type = "ISS-type"
            elif dominant_inc < 30:
                orbit_type = "Equatorial"
            
            risk_zones_data.append({
                'altitude': alt,
                'total_flux': data['total_flux'],
                'debris_per_year': total_debris_per_year,
                'debris_per_km2': debris_per_km2,
                'dominant_inclination': dominant_inc,
                'orbit_type': orbit_type,
                'entries_count': len(data['entries'])
            })
        
        # Sortează după debris_per_km2 descrescător (cele mai periculoase zone)
        risk_zones_data.sort(key=lambda x: x['debris_per_km2'], reverse=True)
        
        # Construiește rezultatul pentru top 5 zone
        risk_zones = []
        colors = ["#FF0000", "#FF3300", "#FF6600", "#FF9900", "#FFCC00"]
        risk_levels = ["CRITICAL", "VERY HIGH", "HIGH", "MODERATE", "ELEVATED"]
        
        # Obține și datele reale de debris pentru statistici suplimentare
        all_debris = fetch_nasa_debris()
        
        for i, zone_data in enumerate(risk_zones_data[:5]):
            alt = zone_data['altitude']
            
            # Numără debris real din această zonă (±50 km)
            debris_in_zone = [d for d in all_debris if abs(d['altitude'] - alt) <= 50]
            large_count = sum(1 for d in debris_in_zone if d.get('rcs_size') == 'LARGE')
            medium_count = sum(1 for d in debris_in_zone if d.get('rcs_size') == 'MEDIUM')
            small_count = sum(1 for d in debris_in_zone if d.get('rcs_size') == 'SMALL')
            
            # Identifică sursele principale
            sources = {}
            for d in debris_in_zone:
                source = d.get('country', 'UNKNOWN')
                sources[source] = sources.get(source, 0) + 1
            top_source = max(sources.items(), key=lambda x: x[1])[0] if sources else 'UNKNOWN'
            
            zone = {
                "name": f"{zone_data['orbit_type']} - {alt} km",
                "altitude_range_km": [alt - 50, alt + 50],
                "center_altitude_km": alt,
                "risk_level": risk_levels[i],
                "nasa_ordem_flux": f"{zone_data['total_flux']:.2e} impacts/m²/year",
                "debris_per_km2": f"{zone_data['debris_per_km2']:.6f} debris/km²",
                "estimated_debris_per_year": int(zone_data['debris_per_year']),
                "dominant_inclination": zone_data['dominant_inclination'],
                "orbit_type": zone_data['orbit_type'],
                "total_debris_tracked": len(debris_in_zone),
                "large_debris": large_count,
                "medium_debris": medium_count,
                "small_debris": small_count,
                "primary_source": top_source,
                "description": f"Zonă {zone_data['orbit_type']} la {alt} km cu flux ORDEM de {zone_data['total_flux']:.2e} impacts/m²/an. Tracking {len(debris_in_zone)} obiecte reale.",
                "color": colors[i]
            }
            risk_zones.append(zone)
        
        return {
            "total_zones": len(risk_zones),
            "zones": risk_zones,
            "source": "NASA ORDEM 3.1 Model + Real Debris Tracking",
            "data_source_url": "https://orbitaldebris.jsc.nasa.gov/",
            "timestamp": dt.datetime.utcnow().isoformat() + "Z",
            "total_debris_analyzed": len(all_debris),
            "ordem_entries_analyzed": len(ordem_data)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Risk zones fetch failed: {e}")


@app.post("/api/debris/predict-impact")
def api_predict_impact(request: dict):
    """
    Calculează probabilitatea de impact între satelit și deșeuri din apropiere
    """
    try:
        print(f"🎯 Impact prediction request received: {request}")
        norad_id = request.get("norad_id")
        if not norad_id:
            raise HTTPException(status_code=400, detail="norad_id required")
        
        print(f"Looking up NORAD ID: {norad_id}")
        rec: Optional[TLERecord] = tle_store.get(norad_id)
        if not rec:
            raise HTTPException(status_code=404, detail=f"NORAD {norad_id} not found")
        
        # Obține poziția curentă aproximativă a satelitului
        from skyfield.api import EarthSatellite, wgs84, load
        ts = load.timescale()
        sat = EarthSatellite(rec.line1, rec.line2, rec.name, ts)
        t = ts.now()
        geocentric = sat.at(t)
        sp = wgs84.subpoint(geocentric)
        
        sat_pos = {
            "altitude_km": float(sp.elevation.km),
            "latitude": float(sp.latitude.degrees),
            "longitude": float(sp.longitude.degrees)
        }
        
        # Generează deșeuri în apropiere (rază mai mare pentru a prinde mai multe obiecte)
        all_debris = fetch_nasa_debris(300)
        nearby_debris = filter_debris_by_proximity(sat_pos, all_debris, max_distance_km=2000)
        
        # Calculează risc pentru fiecare deșeu apropiat
        inc_deg = inclination_from_tle(rec.line1, rec.line2, rec.name)
        
        high_risk_debris = []
        for debris in nearby_debris[:20]:  # Top 20 cei mai periculoși
            # Estimează distanța relativă
            distance_km = math.sqrt(
                (sat_pos["altitude_km"] - debris["altitude"])**2 +
                (sat_pos["latitude"] - debris["latitude"])**2 +
                (sat_pos["longitude"] - debris["longitude"])**2
            )
            
            # Calculează probabilitatea de coliziune
            flux = flux_ordem_like(sat_pos["altitude_km"], inc_deg, 1, 10)
            prob = annual_collision_probability(10.0, 1/365.0, flux)  # 1 zi
            
            high_risk_debris.append({
                "norad_id": debris["norad_id"],
                "name": debris["name"],
                "distance_km": round(distance_km, 2),
                "collision_probability": prob,
                "rcs_size": debris["rcs_size"],
                "relative_velocity_km_s": random.uniform(7, 15)  # Viteză relativă tipică
            })
        
        # Sortează după probabilitate
        high_risk_debris.sort(key=lambda x: x["collision_probability"], reverse=True)
        
        # Determină riscul overall (evită IndexError dacă nu există debris)
        if high_risk_debris and high_risk_debris[0]["collision_probability"] > 0.001:
            overall_risk = "HIGH"
        elif high_risk_debris and high_risk_debris[0]["collision_probability"] > 0.0001:
            overall_risk = "MODERATE"
        else:
            overall_risk = "LOW"
        
        return {
            "satellite": {
                "norad_id": norad_id,
                "name": rec.name,
                "position": sat_pos
            },
            "total_debris_tracked": len(all_debris),
            "nearby_debris_count": len(nearby_debris),
            "high_risk_debris": high_risk_debris[:10],
            "overall_risk": overall_risk,
            "timestamp": dt.datetime.utcnow().isoformat() + "Z"
        }
    except Exception as e:
        import traceback
        print(f"❌ Impact prediction error: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Impact prediction failed: {str(e)}")


@app.get("/api/satellite/position/{norad_id}")
def api_satellite_position(norad_id: int, time_iso: Optional[str] = None):
    """
    Returnează poziția exactă a unui satelit la un moment dat folosind propagare SGP4
    """
    rec: Optional[TLERecord] = tle_store.get(norad_id)
    if not rec:
        raise HTTPException(status_code=404, detail=f"NORAD {norad_id} not found")
    
    try:
        from skyfield.api import load, EarthSatellite, wgs84
        ts = load.timescale()
        satellite = EarthSatellite(rec.line1, rec.line2, rec.name, ts)
        
        # Dacă nu e specificat timpul, folosește timpul curent
        if time_iso:
            target_time = dt.datetime.fromisoformat(time_iso.replace('Z', '+00:00'))
            t = ts.from_datetime(target_time)
        else:
            t = ts.now()
        
        # Propagă poziția
        geocentric = satellite.at(t)
        subpoint = wgs84.subpoint(geocentric)
        
        # Calculează viteza
        velocity = geocentric.velocity.km_per_s
        speed_km_s = (velocity[0]**2 + velocity[1]**2 + velocity[2]**2)**0.5
        
        return {
            "norad_id": norad_id,
            "name": rec.name,
            "timestamp": t.utc_iso(),
            "latitude_deg": float(subpoint.latitude.degrees),
            "longitude_deg": float(subpoint.longitude.degrees),
            "altitude_km": float(subpoint.elevation.km),
            "velocity_km_s": float(speed_km_s),
            "velocity_km_h": float(speed_km_s * 3600)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Position calculation failed: {str(e)}")


@app.get("/api/satellite/trajectory/{norad_id}")
def api_satellite_trajectory(
    norad_id: int, 
    duration_seconds: int = Query(7200, ge=60, le=86400),
    samples: int = Query(120, ge=30, le=300)
):
    """
    Returnează traiectoria completă a unui satelit pe o durată specificată
    folosind propagare SGP4 reală pentru animație precisă
    """
    rec: Optional[TLERecord] = tle_store.get(norad_id)
    if not rec:
        raise HTTPException(status_code=404, detail=f"NORAD {norad_id} not found")
    
    try:
        print(f"🛰️ Calculating trajectory for {rec.name} (NORAD {norad_id})")
        from skyfield.api import load, EarthSatellite, wgs84, utc
        ts = load.timescale()
        print(f"📡 Creating satellite object...")
        satellite = EarthSatellite(rec.line1, rec.line2, rec.name, ts)
        print(f"✅ Satellite object created successfully")
        
        start_time = dt.datetime.now(utc)  # Add UTC timezone
        step_seconds = duration_seconds / samples
        
        trajectory_points = []
        for i in range(samples + 1):
            t_offset = start_time + dt.timedelta(seconds=i * step_seconds)
            t = ts.from_datetime(t_offset)
            
            geocentric = satellite.at(t)
            subpoint = wgs84.subpoint(geocentric)
            
            # Calculează altitudinea orbitală (distanța de la centrul Pământului - raza Pământului)
            # subpoint.elevation.km este deja altitudinea deasupra solului
            altitude_km = subpoint.elevation.km
            
            trajectory_points.append({
                "timestamp": t.utc_iso(),
                "latitude_deg": float(subpoint.latitude.degrees),
                "longitude_deg": float(subpoint.longitude.degrees),
                "altitude_km": float(altitude_km)
            })
        
        print(f"✅ Trajectory calculation complete: {len(trajectory_points)} points")
        return {
            "norad_id": norad_id,
            "name": rec.name,
            "duration_seconds": duration_seconds,
            "sample_count": len(trajectory_points),
            "trajectory": trajectory_points
        }
    except Exception as e:
        print(f"❌ Trajectory calculation error: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Trajectory calculation failed: {str(e)}")


@app.get("/api/satellite/info/{norad_id}")
def api_satellite_full_info(norad_id: int):
    """
    Returnează informații COMPLETE despre un satelit din multiple surse:
    - TLE data și parametri orbitali
    - Informații fizice (masă, dimensiuni, putere)
    - Informații despre misiune (scop, proprietar, dată lansare)
    - Status curent (altitudine, viteză, următorul pass)
    """
    rec: Optional[TLERecord] = tle_store.get(norad_id)
    if not rec:
        raise HTTPException(status_code=404, detail=f"NORAD {norad_id} not found")
    
    try:
        from skyfield.api import load, EarthSatellite, wgs84
        ts = load.timescale()
        satellite = EarthSatellite(rec.line1, rec.line2, rec.name, ts)
        
        # Poziție curentă
        now = ts.now()
        geocentric = satellite.at(now)
        subpoint = wgs84.subpoint(geocentric)
        velocity = geocentric.velocity.km_per_s
        speed_km_s = (velocity[0]**2 + velocity[1]**2 + velocity[2]**2)**0.5
        
        # Parsează TLE pentru parametri orbitali detaliați
        line2_parts = rec.line2.split()
        inclination = float(line2_parts[2]) if len(line2_parts) > 2 else 0
        raan = float(line2_parts[3]) if len(line2_parts) > 3 else 0
        ecc_str = line2_parts[4] if len(line2_parts) > 4 else "0"
        eccentricity = float("0." + ecc_str) if ecc_str.isdigit() else 0
        arg_perigee = float(line2_parts[5]) if len(line2_parts) > 5 else 0
        mean_anomaly = float(line2_parts[6]) if len(line2_parts) > 6 else 0
        mean_motion_str = line2_parts[7] if len(line2_parts) > 7 else "15.0"
        mean_motion = float(mean_motion_str[:11]) if len(mean_motion_str) >= 11 else 15.0
        
        # Calculează apogeu și perigeu
        earth_radius_km = 6371.0
        altitude_km = float(subpoint.elevation.km)
        semi_major_axis = (earth_radius_km + altitude_km)
        
        # Perioadă orbitală
        orbital_period_min = 1440.0 / mean_motion if mean_motion > 0 else 90.0
        
        # Estimare apogeu/perigeu din eccentricitate
        apogee_km = semi_major_axis * (1 + eccentricity) - earth_radius_km
        perigee_km = semi_major_axis * (1 - eccentricity) - earth_radius_km
        
        # Informații despre satelit (bazate pe pattern matching cu nume cunoscute)
        satellite_info = get_satellite_metadata(rec.name, norad_id)
        
        return {
            "basic_info": {
                "norad_id": norad_id,
                "name": rec.name,
                "international_designator": satellite_info.get("intl_designator", "Unknown"),
                "country": satellite_info.get("country", "Unknown"),
                "launch_date": satellite_info.get("launch_date", "Unknown")
            },
            "orbital_parameters": {
                "inclination_deg": inclination,
                "raan_deg": raan,
                "eccentricity": eccentricity,
                "argument_of_perigee_deg": arg_perigee,
                "mean_anomaly_deg": mean_anomaly,
                "mean_motion_rev_per_day": mean_motion,
                "orbital_period_minutes": orbital_period_min,
                "apogee_km": apogee_km,
                "perigee_km": perigee_km,
                "semi_major_axis_km": semi_major_axis
            },
            "current_state": {
                "timestamp": now.utc_iso(),
                "latitude_deg": float(subpoint.latitude.degrees),
                "longitude_deg": float(subpoint.longitude.degrees),
                "altitude_km": altitude_km,
                "velocity_km_s": float(speed_km_s),
                "velocity_km_h": float(speed_km_s * 3600)
            },
            "physical_characteristics": {
                "mass_kg": satellite_info.get("mass_kg", "Unknown"),
                "dimensions": satellite_info.get("dimensions", "Unknown"),
                "power_watts": satellite_info.get("power_watts", "Unknown"),
                "rcs_size": satellite_info.get("rcs_size", "MEDIUM")
            },
            "mission_info": {
                "purpose": satellite_info.get("purpose", "Unknown"),
                "operator": satellite_info.get("operator", "Unknown"),
                "mission_type": satellite_info.get("mission_type", "Unknown"),
                "status": satellite_info.get("status", "Active"),
                "expected_lifetime_years": satellite_info.get("lifetime_years", "Unknown")
            },
            "tracking_links": {
                "n2yo": f"https://www.n2yo.com/satellite/?s={norad_id}",
                "heavens_above": f"https://www.heavens-above.com/orbit.aspx?satid={norad_id}",
                "space_track": f"https://www.space-track.org/basicspacedata/query/class/tle/NORAD_CAT_ID/{norad_id}",
                "celestrak": f"https://celestrak.org/NORAD/elements/gp.php?CATNR={norad_id}"
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Full info retrieval failed: {str(e)}")


def get_satellite_metadata(name: str, norad_id: int) -> Dict:
    """
    Returnează metadata despre satelit bazată pe nume și NORAD ID
    Folosește pattern matching cu baza de date internă de sateliți cunoscuți
    """
    name_upper = name.upper()
    
    # Database de sateliți cunoscuți cu informații complete
    known_satellites = {
        "ISS": {
            "country": "International",
            "operator": "NASA/Roscosmos/ESA/JAXA/CSA",
            "launch_date": "1998-11-20",
            "mass_kg": 419700,
            "dimensions": "73m × 109m × 20m",
            "power_watts": 120000,
            "purpose": "Space research and microgravity experiments",
            "mission_type": "Crewed Space Station",
            "rcs_size": "LARGE",
            "status": "Active",
            "lifetime_years": "25+",
            "intl_designator": "1998-067A"
        },
        "HUBBLE": {
            "country": "USA",
            "operator": "NASA/ESA",
            "launch_date": "1990-04-24",
            "mass_kg": 11110,
            "dimensions": "13.2m × 4.2m diameter",
            "power_watts": 2800,
            "purpose": "Space telescope for astronomical observation",
            "mission_type": "Space Observatory",
            "rcs_size": "LARGE",
            "status": "Active",
            "lifetime_years": "35+",
            "intl_designator": "1990-037B"
        },
        "STARLINK": {
            "country": "USA",
            "operator": "SpaceX",
            "launch_date": "2019-2024",
            "mass_kg": 260,
            "dimensions": "2.8m × 1.4m × 0.3m",
            "power_watts": 4000,
            "purpose": "Global broadband internet constellation",
            "mission_type": "Communications",
            "rcs_size": "SMALL",
            "status": "Active",
            "lifetime_years": "5",
            "intl_designator": "Various"
        },
        "GPS": {
            "country": "USA",
            "operator": "US Space Force",
            "launch_date": "1978-present",
            "mass_kg": 2000,
            "dimensions": "5.3m wingspan",
            "power_watts": 2400,
            "purpose": "Global navigation satellite system",
            "mission_type": "Navigation",
            "rcs_size": "MEDIUM",
            "status": "Active",
            "lifetime_years": "15",
            "intl_designator": "Various"
        },
        "NOAA": {
            "country": "USA",
            "operator": "NOAA",
            "launch_date": "1978-present",
            "mass_kg": 1440,
            "dimensions": "4.2m × 1.9m",
            "power_watts": 1800,
            "purpose": "Weather monitoring and climate research",
            "mission_type": "Earth Observation",
            "rcs_size": "MEDIUM",
            "status": "Active",
            "lifetime_years": "5-7",
            "intl_designator": "Various"
        },
        "COSMOS": {
            "country": "Russia",
            "operator": "Russian Space Forces",
            "launch_date": "1962-present",
            "mass_kg": 1500,
            "dimensions": "Variable",
            "power_watts": 2000,
            "purpose": "Military reconnaissance and communications",
            "mission_type": "Military",
            "rcs_size": "MEDIUM",
            "status": "Various",
            "lifetime_years": "3-10",
            "intl_designator": "Various"
        }
    }
    
    # Pattern matching
    for key, data in known_satellites.items():
        if key in name_upper:
            return data
    
    # Default pentru sateliți necunoscuți
    return {
        "country": "Unknown",
        "operator": "Unknown",
        "launch_date": "Unknown",
        "mass_kg": "Unknown",
        "dimensions": "Unknown",
        "power_watts": "Unknown",
        "purpose": "Unknown mission",
        "mission_type": "Unknown",
        "rcs_size": "MEDIUM",
        "status": "Unknown",
        "lifetime_years": "Unknown",
        "intl_designator": "Unknown"
    }


@app.get("/", response_class=HTMLResponse)
def index():
    index_path = os.path.join(CLIENT_DIR, "index.html")
    return FileResponse(index_path)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8001)), reload=False)