# 🛰️ Space Debris Tracker - NASA Demo

[![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104+-green.svg)](https://fastapi.tiangolo.com/)
[![Cesium](https://img.shields.io/badge/Cesium-1.122-blue.svg)](https://cesium.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **Advanced 3D visualization and analysis platform for tracking space debris and satellites using real NASA data and SGP4 orbital propagation.**

![Space Debris Tracker Demo](https://via.placeholder.com/800x400/0a0e27/4a90e2?text=Space+Debris+Tracker+Demo)

---

## 🌟 Features

### 🛰️ Satellite Visualization
- **Real-time 3D Globe**: Interactive Cesium.js globe with WebGL rendering
- **TLE Data Loading**: Fetch latest Two-Line Element sets from CelesTrak
- **Multiple View Modes**:
  - 🌐 All Satellites (Mixed LEO + Non-LEO)
  - 🌍 LEO Satellites (<2000 km)
  - 🌌 Non-LEO Satellites (>2000 km - MEO/GEO)
- **Animated Orbits**: Real-time SGP4 propagation with 60x time acceleration
- **Visual Hierarchy**: Color-coded satellites (Rainbow gradient, AQUA, DARKORANGE)

### 🚨 Risk Analysis
- **NASA ORDEM Integration**: 5 risk zones based on NASA Orbital Debris Engineering Model
- **Impact Prediction**: Calculate collision probabilities with nearby debris
- **Custom Risk Analysis**: Personalized collision risk calculations
- **Space Weather**: Real-time solar events from NASA DONKI API (CME, Solar Flares)

### 📊 Advanced Features
- **SGP4 Orbital Propagation**: Precise trajectory calculations using Skyfield
- **3D Distance Calculations**: Euclidean space distance between objects
- **Orbital Velocity**: Real-time velocity calculations for all satellites
- **Debris Tracking**: Monitor 300+ simulated debris objects in LEO/MEO/GEO

---

## 🚀 Quick Start

### Prerequisites

- **Python 3.11+**
- **pip** (Python package manager)
- **Git**

### Installation

1. **Clone the repository:**
```bash
git clone https://github.com/YOUR_USERNAME/space-debris-nasa-demo.git
cd space-debris-nasa-demo
```

2. **Create virtual environment:**
```bash
python -m venv .venv

# Windows
.venv\Scripts\activate

# Linux/Mac
source .venv/bin/activate
```

3. **Install Python dependencies:**
```bash
pip install -r requirements.txt
```

4. **Start the server:**
```bash
cd server
python main.py
```

5. **Open in browser:**
```
http://127.0.0.1:8001
```

---

## 📖 Usage Guide

### Step 1: Load TLE Data
Click **"📡 Load TLE Data"** to download satellite data from CelesTrak.

**Available Categories:**
- Active Satellites (~3000 objects)
- Weather Satellites
- Communications
- Science
- Earth Observation

### Step 2: Visualize Satellites
Select a view type from the **"🛰️ Visualize Satellites"** dropdown:
- Choose number of satellites (5-100)
- Toggle **"Show with real SGP4 orbits"** for animated trajectories

### Step 3: Advanced Features

#### 🌍 Propagate Orbit
- Select a satellite
- Click **"Propagate Orbit"**
- Adjust duration (minutes) and step (seconds)

#### 🚨 NASA Risk Zones
- Click **"NASA Risk Zones"**
- View 5 orbital risk zones with NASA ORDEM data
- Click first point in each orbit for detailed flux data

#### 🎯 Predict Impact
- Select a satellite
- Click **"Predict Impact"**
- View top 5 high-risk debris with collision probabilities

#### ☀️ Space Weather
- Click **"Space Weather"**
- View recent solar events (CME, Flares, Geomagnetic Storms)

---

## 🏗️ Architecture

### Backend (FastAPI + Python)
```
server/
├── main.py              # FastAPI server with 15+ REST endpoints
├── propagate.py         # SGP4 orbital propagation (Skyfield)
├── risk.py              # Collision risk calculations
├── nasa.py              # NASA API integrations
└── tle_store.py         # In-memory TLE data storage
```

**Key Technologies:**
- **FastAPI**: Modern async web framework
- **Skyfield**: Astronomical calculations and SGP4 propagation
- **NumPy**: Scientific computing for orbital mechanics
- **Requests**: HTTP client for NASA APIs

### Frontend (Cesium.js + JavaScript)
```
client/
├── index.html           # Main application page
├── documentation.html   # Complete documentation
├── app-new.js          # Cesium Manager (3D visualization)
├── config.js           # API endpoint configuration
└── js/
    ├── constants.js    # Application constants
    ├── dom-cache.js    # DOM element caching
    ├── error-handler.js # Error management
    ├── api-manager.js  # API request handling
    └── event-manager.js # Event delegation system
```

**Key Technologies:**
- **Cesium.js 1.122**: WebGL 3D globe rendering
- **JavaScript ES6+**: Modern async/await patterns
- **HTML5/CSS3**: Responsive UI with gradient backgrounds

---

## 🔗 NASA APIs Used

### 1. CelesTrak TLE Data
```
GET https://celestrak.org/NORAD/elements/gp.php?GROUP={group}&FORMAT=tle
```
- Provides Two-Line Element sets for all tracked space objects
- Updated daily with latest orbital parameters

### 2. NASA ORDEM (Orbital Debris Engineering Model)
- Statistical model for debris flux at various altitudes
- Integrated data from NASA ORDEM 3.1 Technical Report
- Risk zones: LEO (400-1400 km), MEO (20,200 km), GEO (35,786 km)

### 3. NASA DONKI (Space Weather)
```
GET https://api.nasa.gov/DONKI/CME?startDate={date}&api_key={key}
```
- Coronal Mass Ejections (CME)
- Solar Flares (FLR)
- Geomagnetic Storms (GST)

### 4. Skyfield (SGP4 Propagator)
```python
from skyfield.api import EarthSatellite, load, wgs84
sat = EarthSatellite(line1, line2, name, ts)
geocentric = sat.at(t)
```
- Precise orbital calculations from TLE data
- WGS84 coordinate transformations

---

## 📐 Mathematical Formulas

### SGP4 Orbital Propagation
```
Position at time t:
r(t) = [x(t), y(t), z(t)]

Calculated through:
1. Extract orbital elements from TLE (a, e, i, Ω, ω, M₀)
2. Calculate mean anomaly: M(t) = M₀ + n·(t - t₀)
3. Solve Kepler's equation: M = E - e·sin(E)
4. Convert to Cartesian coordinates
5. Apply perturbations (J₂, drag, etc.)
```

### Collision Probability
```
P_annual = 1 - exp(-F × A × T)

Where:
F = debris flux (impacts/m²/year) from NASA ORDEM
A = satellite cross-sectional area (m²)
T = time period (years)
```

### Orbital Velocity
```
v = √(μ / r)

Where:
μ = 398,600 km³/s² (Earth gravitational parameter)
r = orbital radius (km)

Examples:
- ISS (400 km): 7.67 km/s
- GPS (20,200 km): 3.87 km/s
- GEO (35,786 km): 3.07 km/s
```

---

## 📊 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Server health check |
| `/api/tle/load` | POST | Load TLE data from CelesTrak |
| `/api/objects` | GET | List all loaded satellites |
| `/api/satellite/details` | GET | Satellite details by NORAD ID |
| `/api/propagate` | GET | SGP4 orbit propagation |
| `/api/satellite/trajectory/{id}` | GET | Precise trajectory calculation |
| `/api/flux` | GET | NASA ORDEM flux data |
| `/api/risk` | POST | Collision risk calculation |
| `/api/risk-zones` | GET | 5 NASA ORDEM risk zones |
| `/api/debris/predict-impact` | POST | Impact prediction with debris |
| `/api/donki` | GET | NASA DONKI space weather |

---

## 🎨 Visual Features

### Color Coding
- **🌈 All Satellites**: HSL rainbow gradient (hue 0-360°)
- **🌊 LEO Satellites**: AQUA (bright cyan-green)
- **🟠 Non-LEO Satellites**: DARKORANGE + YELLOW outline
- **🔴 Risk Zones**: Color gradient from RED (critical) to BLUE (elevated)

### Size Hierarchy
- **All Satellites**: 10px points, 3px path trails
- **LEO Satellites**: 10px points, 3px path trails
- **Non-LEO Satellites**: 12px points (largest), 4px path trails (thickest)

### Animation
- **60x Speed**: Real-time → 60x acceleration
- **Loop Mode**: Continuous orbit animation
- **Interpolation**: Smooth SampledPositionProperty transitions

---

## 🧪 Testing

### Load Sample Data
```bash
# Start server
cd server
python main.py

# In browser (http://127.0.0.1:8001):
1. Click "Load TLE Data" → Select "Active Satellites"
2. Select "All Satellites" → Check "Show with real SGP4 orbits"
3. Click "Visualize Selected"
```

### Test Impact Prediction
```bash
1. Load TLE data
2. Select satellite (e.g., ISS - 25544)
3. Click "Predict Impact"
4. View top 5 high-risk debris
```

---

## 📝 Configuration

### Backend Configuration
Edit `server/main.py`:
```python
# Server port
uvicorn.run(app, host="0.0.0.0", port=8001)

# CORS origins
origins = ["http://localhost:8001", "http://127.0.0.1:8001"]
```

### Frontend Configuration
Edit `client/config.js`:
```javascript
const CONFIG = {
  API_BASE_URL: 'http://127.0.0.1:8001'
};
```

---

## 🐛 Troubleshooting

### Issue: Server won't start
```bash
# Check if port 8001 is already in use
netstat -ano | findstr :8001

# Kill the process (Windows)
taskkill /F /PID <PID>

# Kill the process (Linux/Mac)
kill -9 <PID>
```

### Issue: No satellites visible
1. Ensure TLE data is loaded (check console for "TLE data loaded" message)
2. Verify server is running (check http://127.0.0.1:8001/api/health)
3. Clear browser cache (Ctrl + F5)

### Issue: Orbits not animating
1. Ensure "Show with real SGP4 orbits" is checked
2. Wait for propagation to complete (10-30 seconds)
3. Check console for errors

---

## 📚 Documentation

Full documentation available at:
```
http://127.0.0.1:8001/static/documentation.html
```

Includes:
- Complete user guide with step-by-step instructions
- NASA API details with endpoints and parameters
- Mathematical formulas with examples
- Technical implementation details
- Troubleshooting guide

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **NASA**: For ORDEM data, DONKI API, and space debris research
- **CelesTrak**: For real-time TLE data
- **Skyfield**: For SGP4 implementation
- **Cesium.js**: For 3D globe visualization
- **FastAPI**: For modern Python web framework

---

## 📞 Contact

**Author**: Your Name  
**Email**: your.email@example.com  
**GitHub**: [@your-username](https://github.com/your-username)  
**Project Link**: [https://github.com/your-username/space-debris-nasa-demo](https://github.com/your-username/space-debris-nasa-demo)

---

## 📈 Future Improvements

- [ ] Real-time Space-Track.org API integration
- [ ] Machine learning debris classification
- [ ] Collision avoidance maneuver suggestions
- [ ] Historical orbit replay
- [ ] Multi-satellite trajectory comparison
- [ ] Export data to CSV/JSON
- [ ] Mobile app version
- [ ] Dark/Light theme toggle

---

<div align="center">

**⭐ Star this repo if you find it useful! ⭐**

Made with ❤️ using NASA APIs, Cesium.js & FastAPI

</div>
