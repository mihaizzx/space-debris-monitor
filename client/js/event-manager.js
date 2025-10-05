// Centralized Event Delegation System
class EventManager {
  constructor(domCache, apiManager, errorHandler) {
    this.dom = domCache || DOM;
    this.api = apiManager || API;
    this.errorHandler = errorHandler || ErrorManager;
    this.handlers = new Map();
    this.initialized = false;
  }

  // Initialize event delegation
  init() {
    if (this.initialized) {
      console.log('EventManager already initialized');
      return;
    }

    console.log('EventManager: Setting up event listeners...');

    // Setup main event delegation listener
    document.addEventListener('click', this.handleClick.bind(this));
    document.addEventListener('change', this.handleChange.bind(this));
    document.addEventListener('submit', this.handleSubmit.bind(this));

    console.log('EventManager: Event listeners added');

    // Register all handlers
    this.registerHandlers();
    console.log('EventManager: Handlers registered, total:', this.handlers.size);
    
    this.initialized = true;
    console.log('EventManager: Initialization complete');
  }

  // Main click handler with delegation
  handleClick(event) {
    const target = event.target;
    const action = target.dataset.action;
    const buttonId = target.id;

    console.log('Click detected:', { target: target.tagName, action, buttonId });

    // Handle data-action attributes
    if (action && this.handlers.has(action)) {
      console.log('Handling action:', action);
      event.preventDefault();
      this.executeHandler(action, target, event);
      return;
    }

    // Handle specific button IDs
    if (buttonId && this.handlers.has(buttonId)) {
      console.log('Handling button ID:', buttonId);
      event.preventDefault();
      this.executeHandler(buttonId, target, event);
      return;
    }

    // Handle parent elements with actions (for complex buttons with nested elements)
    const actionParent = target.closest('[data-action]');
    if (actionParent && actionParent.dataset.action) {
      console.log('Handling parent action:', actionParent.dataset.action);
      event.preventDefault();
      this.executeHandler(actionParent.dataset.action, actionParent, event);
      return;
    }
  }

  // Handle change events
  handleChange(event) {
    const target = event.target;
    const action = target.dataset.changeAction;

    if (action && this.handlers.has(action)) {
      this.executeHandler(action, target, event);
    }
  }

  // Handle form submissions
  handleSubmit(event) {
    const target = event.target;
    const action = target.dataset.submitAction;

    if (action && this.handlers.has(action)) {
      event.preventDefault();
      this.executeHandler(action, target, event);
    }
  }

  // Execute handler with error handling
  async executeHandler(action, element, event) {
    try {
      const handler = this.handlers.get(action);
      if (typeof handler === 'function') {
        await handler(element, event, this);
      }
    } catch (error) {
      this.errorHandler.handleJsError(error, `Event handler: ${action}`);
    }
  }

  // Register a handler
  registerHandler(action, handler) {
    this.handlers.set(action, handler);
  }

  // Register all application handlers
  registerHandlers() {
    // Sidebar toggle
    this.registerHandler('toggleSidebar', () => {
      this.dom.toggleSidebar();
    });

    // TLE Loading from dropdown
    this.registerHandler('loadSelectedTLE', async (element) => {
      console.log('🔍 loadSelectedTLE handler started');
      
      const selectElement = document.getElementById('tleDataSelect');
      console.log('📍 Select element:', selectElement);
      
      const selectedValue = selectElement?.value;
      console.log('📍 Selected value:', selectedValue);
      
      if (!selectedValue) {
        console.log('⚠️ No value selected');
        this.errorHandler.showWarning('Please select a TLE data category first');
        return;
      }
      
      const categoryMap = {
        'celestrak': { category: 'stations', name: 'All TLE Data (Space Stations)', icon: '🌐' },
        'active': { category: 'active', name: 'Active Satellites', icon: '🛰️' },
        'weather': { category: 'weather', name: 'Weather Satellites', icon: '🌦️' },
        'science': { category: 'science', name: 'Science Satellites', icon: '🔬' },
        'communications': { category: 'communications', name: 'Communication Satellites', icon: '📡' },
        'gps-ops': { category: 'gps-ops', name: 'Navigation (GPS)', icon: '🧭' }
      };
      
      const selected = categoryMap[selectedValue];
      console.log('📍 Mapped category:', selected);
      
      if (selected) {
        console.log('✅ Category found, proceeding directly...');
        console.log('🚀 Starting TLE load...');
        this.dom.setLoadingState('btnLoadTLEData', true);
        try {
          console.log('📡 Calling loadTLEWithUI with:', selected.category, selected.name);
          await this.api.loadTLEWithUI(selected.category, selected.name, selected.icon, 'btnLoadTLEData');
          console.log('✅ loadTLEWithUI completed');
        } catch (error) {
          console.error('❌ Error in loadTLEWithUI:', error);
          this.errorHandler.handleJsError(error, `Loading ${selected.name}`);
        } finally {
          console.log('🏁 Resetting button state');
          this.dom.setLoadingState('btnLoadTLEData', false);
        }
      } else {
        console.log('❌ No category found for value:', selectedValue);
      }
      
      console.log('🔍 loadSelectedTLE handler finished');
    });

    // Keep old handlers for backward compatibility
    this.registerHandler('loadCelestrak', async (element) => {
      await this.api.loadTLEWithUI('active', 'Active Satellites', '🛰️', 'btnLoadCelestrak');
    });

    this.registerHandler('loadActiveData', async (element) => {
      await this.api.loadTLEWithUI('active', 'Active Satellites', '🛰️', 'btnLoadActiveData');
    });

    this.registerHandler('loadWeatherData', async (element) => {
      await this.api.loadTLEWithUI('weather', 'Weather Satellites', '🌦️', 'btnLoadWeatherData');
    });

    this.registerHandler('loadScienceData', async (element) => {
      await this.api.loadTLEWithUI('science', 'Science Satellites', '🔬', 'btnLoadScienceData');
    });

    this.registerHandler('loadCommunicationData', async (element) => {
      await this.api.loadTLEWithUI('communications', 'Communication Satellites', '📡', 'btnLoadCommunicationData');
    });

    this.registerHandler('loadNavigationData', async (element) => {
      await this.api.loadTLEWithUI('gps-ops', 'GPS Satellites', '🧭', 'btnLoadNavigationData');
    });

    // Refresh objects
    this.registerHandler('refreshObjects', async (element) => {
      this.dom.setLoadingState('btnRefresh', true);
      try {
        await this.api.refreshObjectsList();
        this.errorHandler.showSuccess('Objects list refreshed');
      } finally {
        this.dom.setLoadingState('btnRefresh', false);
      }
    });

    // Add to scene
    this.registerHandler('addToScene', async (element) => {
      const objectSelect = this.dom.get('objectSelect');
      const minutesEl = this.dom.get('minutesEl');
      const stepEl = this.dom.get('stepEl');

      if (!objectSelect.value) {
        this.errorHandler.showWarning(CONFIG.ERRORS.NO_OBJECT_SELECTED);
        return;
      }

      this.dom.setLoadingState('btnAddToScene', true);
      try {
        const propagation = await this.api.propagateOrbitWithUI(
          parseInt(objectSelect.value),
          parseFloat(minutesEl.value) || 90,
          parseFloat(stepEl.value) || 1
        );

        // Add to Cesium scene (this would need CesiumManager)
        if (window.CesiumManager) {
          window.CesiumManager.addOrbitEntity(propagation);
        }
      } finally {
        this.dom.setLoadingState('btnAddToScene', false);
      }
    });

    // NASA DONKI
    this.registerHandler('fetchDonki', async (element) => {
      this.dom.setLoadingState('btnDonki', true);
      try {
        this.dom.showResult('donkiResult', 'Querying NASA DONKI...');
        const data = await this.api.getNASADonki();
        
        const latest = data.latest_kp;
        if (latest) {
          this.dom.showResult('donkiResult', `Latest Kp: ${latest.kpIndex} at ${latest.observedTime}`);
        } else {
          this.dom.showResult('donkiResult', 'No Kp values in range.');
        }
      } catch (error) {
        this.dom.showResult('donkiResult', 'DONKI Error.');
      } finally {
        this.dom.setLoadingState('btnDonki', false);
      }
    });

    // Risk Analysis
    this.registerHandler('calculateRisk', async (element) => {
      const objectSelect = this.dom.get('objectSelect');
      
      if (!objectSelect.value) {
        this.errorHandler.showWarning(CONFIG.ERRORS.NO_OBJECT_SELECTED);
        return;
      }

      if (!window.lastPropagation || !window.lastPropagation.samples || window.lastPropagation.samples.length === 0) {
        this.errorHandler.showWarning(CONFIG.ERRORS.NO_PROPAGATION_DATA);
        return;
      }

      const formValues = this.dom.getFormValues(['areaEl', 'daysEl', 'sizeMinEl', 'sizeMaxEl']);
      
      const meanAlt = window.lastPropagation.samples.reduce((acc, s) => acc + s.alt_km, 0) / window.lastPropagation.samples.length;

      const params = {
        norad_id: objectSelect.value,
        alt_km: String(meanAlt),
        area_m2: formValues.areaEl || '1.0',
        size_min_cm: formValues.sizeMinEl || '1.0',
        size_max_cm: formValues.sizeMaxEl || '10.0',
        duration_days: formValues.daysEl || '30'
      };

      this.dom.setLoadingState('btnRisk', true);
      try {
        this.dom.showResult('riskResult', 'Calculating risk...');
        const riskData = await this.api.calculateRiskWithUI(params);
        
        // Format and display results
        const riskPercent = (riskData.collision_probability * 100).toFixed(4);
        const resultText = this.formatRiskResult(riskData, riskPercent);
        this.dom.showResult('riskResult', resultText);
      } finally {
        this.dom.setLoadingState('btnRisk', false);
      }
    });

    // Debris simulation - NASA Real Data
    this.registerHandler('simulateDebris', async (element) => {
      this.dom.setLoadingState('btnSimulateDebris', true);
      try {
        // Citește setările utilizatorului
        const debrisCountInput = document.getElementById('debrisCount');
        const debrisWithMotionCheckbox = document.getElementById('debrisWithMotion');
        const maxDebris = parseInt(debrisCountInput?.value || 100);
        const withMotion = debrisWithMotionCheckbox?.checked || false;
        
        if (withMotion && maxDebris > 50) {
          const confirm = window.confirm(`You selected ${maxDebris} debris with motion. This may slow down your browser significantly. Recommended: max 50 debris.\n\nContinue anyway?`);
          if (!confirm) {
            this.dom.setLoadingState('btnSimulateDebris', false);
            return;
          }
        }
        
        this.errorHandler.showInfo(`Loading ${maxDebris} real NASA debris${withMotion ? ' with motion' : ''}...`);
        
        // Încarcă date reale NASA despre deșeuri
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/debris/real-data?limit=${maxDebris}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const debrisData = await response.json();
        
        console.log('NASA debris data:', debrisData);
        
        // Vizualizează deșeurile
        if (window.CesiumManager && window.CesiumManager.viewer) {
          const viewer = window.CesiumManager.viewer;
          
          // Șterge deșeurile anterioare
          if (window.CesiumManager.clearDebris) {
            window.CesiumManager.clearDebris();
          }
          
          // Adaugă deșeurile noi
          const AppState = window.AppState || { debrisEntities: [] };
          AppState.debrisEntities = AppState.debrisEntities || [];
          
          // Setează clock-ul o singură dată ÎNAINTE de loop (pentru animație)
          if (withMotion) {
            const startTime = Cesium.JulianDate.now();
            const simulationDuration = 7200; // 2 ore
            viewer.clock.startTime = startTime.clone();
            viewer.clock.currentTime = startTime.clone();
            viewer.clock.stopTime = Cesium.JulianDate.addSeconds(startTime, simulationDuration, new Cesium.JulianDate());
            viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
            viewer.clock.multiplier = 120; // Viteză animație
            viewer.clock.shouldAnimate = true;
          }
          
          debrisData.debris.forEach(debris => {
            try {
              // Culoare bazată pe tipul de risc
              let color = Cesium.Color.YELLOW;
              if (debris.rcs_size === 'LARGE') color = Cesium.Color.RED;
              else if (debris.rcs_size === 'MEDIUM') color = Cesium.Color.ORANGE;
              else if (debris.rcs_size === 'SMALL') color = Cesium.Color.YELLOW;
              
              let position;
              let pathTrailTime = 3600; // Default trail time
              
              if (withMotion) {
                // Crează traiectorie orbitală realistă
                const startTime = Cesium.JulianDate.now();
                const property = new Cesium.SampledPositionProperty();
                
                // Calculează parametri orbitali
                const earthRadius = 6371000; // meters
                const altitude = debris.altitude * 1000; // Convert km to meters
                const orbitRadius = earthRadius + altitude;
                
                // Perioadă orbitală folosind legea a 3-a a lui Kepler
                const mu = 398600.4418; // km³/s² (constantă gravitațională terestră)
                const orbitalPeriod = 2 * Math.PI * Math.sqrt(Math.pow(orbitRadius / 1000, 3) / mu); // seconds
                pathTrailTime = orbitalPeriod;
                
                // Viteză unghiulară (rad/s)
                const angularVelocity = (2 * Math.PI) / orbitalPeriod;
                
                // Inclinație orbitală (folosim inclinația reală din date)
                const inclination = debris.inclination * (Math.PI / 180); // convertește la radiani
                
                // Generează poziții pentru orbită completă (90 puncte pentru fluiditate)
                const numSamples = 90;
                for (let j = 0; j < numSamples; j++) {
                  const timeOffset = j * (orbitalPeriod / numSamples);
                  const time = Cesium.JulianDate.addSeconds(startTime, timeOffset, new Cesium.JulianDate());
                  
                  // Unghi orbital
                  const theta = angularVelocity * timeOffset;
                  
                  // Poziție în planul orbital (coordonate 3D cu inclinație)
                  const x = orbitRadius * Math.cos(theta);
                  const y = orbitRadius * Math.sin(theta) * Math.cos(inclination);
                  const z = orbitRadius * Math.sin(theta) * Math.sin(inclination);
                  
                  // Rotație cu longitudinea inițială
                  const lon = debris.longitude * (Math.PI / 180);
                  const xRot = x * Math.cos(lon) - y * Math.sin(lon);
                  const yRot = x * Math.sin(lon) + y * Math.cos(lon);
                  
                  const position3D = new Cesium.Cartesian3(xRot, yRot, z);
                  property.addSample(time, position3D);
                }
                
                position = property;
              } else {
                // Punct static
                position = Cesium.Cartesian3.fromDegrees(
                  debris.longitude,
                  debris.latitude,
                  debris.altitude * 1000
                );
              }
              
              const entity = viewer.entities.add({
                id: `debris_${debris.norad_id}`,
                name: debris.name,
                position: position,
                point: {
                  pixelSize: debris.rcs_size === 'LARGE' ? 6 : debris.rcs_size === 'MEDIUM' ? 4 : 3,
                  color: color.withAlpha(0.8),
                  outlineColor: Cesium.Color.WHITE,
                  outlineWidth: 1
                },
                path: withMotion ? {
                  material: color.withAlpha(0.5),
                  width: 2,
                  resolution: 120,
                  trailTime: pathTrailTime,
                  leadTime: 0
                } : undefined,
                description: `
                  <h3>${debris.name}</h3>
                  <p><strong>NORAD ID:</strong> ${debris.norad_id}</p>
                  <p><strong>Type:</strong> ${debris.object_type}</p>
                  <p><strong>RCS Size:</strong> ${debris.rcs_size}</p>
                  <p><strong>Altitude:</strong> ${debris.altitude.toFixed(2)} km</p>
                  <p><strong>Inclination:</strong> ${debris.inclination.toFixed(2)}°</p>
                  <p><strong>Country:</strong> ${debris.country}</p>
                  <p><strong>Motion:</strong> ${withMotion ? 'Animated orbit' : 'Static position'}</p>
                `
              });
              
              AppState.debrisEntities.push(entity);
            } catch (error) {
              console.warn(`Failed to visualize debris ${debris.norad_id}:`, error);
            }
          });
          
          window.AppState = AppState;
        }

        this.dom.showResult('debrisResult', `
          <div>
            <strong>🛰️ NASA Real Debris Data Loaded</strong><br>
            Total debris tracked: ${debrisData.total_debris}<br>
            Visualized: ${debrisData.debris.length}<br>
            Source: ${debrisData.source}<br>
            <small>Timestamp: ${debrisData.timestamp}</small>
          </div>
        `);
        
        this.errorHandler.showSuccess(`Loaded ${debrisData.total_debris} real NASA debris objects`);
      } catch (error) {
        this.errorHandler.handleJsError(error, 'Loading NASA debris data');
      } finally {
        this.dom.setLoadingState('btnSimulateDebris', false);
      }
    });

    // Clear operations - Universal Clear All button
    this.registerHandler('clearAll', () => {
      if (window.CesiumManager) {
        window.CesiumManager.clearAll();
      }
      this.errorHandler.showInfo('All objects cleared from scene');
    });

    // Satellite visualization from dropdown
    this.registerHandler('showSelectedSatellites', async (element) => {
      const selectElement = document.getElementById('satelliteViewSelect');
      const selectedValue = selectElement?.value;
      
      if (!selectedValue) {
        this.errorHandler.showWarning('Please select a satellite view type first');
        return;
      }
      
      if (!window.CesiumManager) {
        this.errorHandler.showError('Cesium Manager not initialized');
        return;
      }
      
      // Show confirmation dialog with settings
      let confirmMessage = '';
      let actionFunction = null;
      
      switch(selectedValue) {
        case 'all':
          const satCount = document.getElementById('satelliteCount')?.value || 50;
          const withOrbits = document.getElementById('withOrbits')?.checked || false;
          confirmMessage = `Visualize ${satCount} satellites${withOrbits ? ' with real SGP4 orbits' : ' as static points'}?\n\n${withOrbits ? '⚠️ Orbits may take time to load.' : '✓ Fast visualization mode.'}`;
          actionFunction = () => window.CesiumManager.showAllSatellites();
          break;
          
        case 'leo':
          const leoCount = document.getElementById('leoSatelliteCount')?.value || 30;
          const leoWithOrbits = document.getElementById('leoWithOrbits')?.checked || false;
          confirmMessage = `Visualize ${leoCount} LEO satellites (<2000km)${leoWithOrbits ? ' with real SGP4 orbits' : ' as static points'}?\n\n${leoWithOrbits ? '⚠️ Orbits may take time to load.' : '✓ Fast visualization mode.'}`;
          actionFunction = () => window.CesiumManager.showLEOSatellites();
          break;
          
        case 'nonleo':
          const nonLeoCount = document.getElementById('nonLeoSatelliteCount')?.value || 20;
          const nonLeoWithOrbits = document.getElementById('nonLeoWithOrbits')?.checked || false;
          confirmMessage = `Visualize ${nonLeoCount} Non-LEO satellites (>2000km)${nonLeoWithOrbits ? ' with real SGP4 orbits' : ' as static points'}?\n\n${nonLeoWithOrbits ? '⚠️ Orbits may take time to load.' : '✓ Fast visualization mode.'}`;
          actionFunction = () => window.CesiumManager.showNonLEOSatellites();
          break;
          
        case 'leo-boundary':
          confirmMessage = 'Toggle LEO boundary visualization (2000km altitude sphere)?';
          actionFunction = () => window.CesiumManager.toggleLEOVisualization();
          break;
      }
      
      if (actionFunction) {
        console.log('🚀 Executing satellite visualization:', selectedValue);
        await actionFunction();
      }
    });

    // Keep old handlers for backward compatibility
    this.registerHandler('showAllSatellites', async (element) => {
      if (window.CesiumManager) {
        window.CesiumManager.showAllSatellites();
      }
    });

    this.registerHandler('showLEOSatellites', async (element) => {
      if (window.CesiumManager) {
        window.CesiumManager.showLEOSatellites();
      }
    });

    this.registerHandler('showNonLEOSatellites', async (element) => {
      if (window.CesiumManager) {
        window.CesiumManager.showNonLEOSatellites();
      }
    });

    this.registerHandler('toggleLEO', () => {
      if (window.CesiumManager) {
        window.CesiumManager.toggleLEOVisualization();
      }
    });

    // NASA Risk Zones
    this.registerHandler('showNASARiskZones', async (element) => {
      this.dom.setLoadingState('btnShowNASARiskZones', true);
      try {
        if (window.CesiumManager) {
          window.CesiumManager.showNASARiskZones();
        }
        this.errorHandler.showSuccess('NASA risk zones displayed');
      } finally {
        this.dom.setLoadingState('btnShowNASARiskZones', false);
      }
    });

    // Impact prediction
    this.registerHandler('predictImpact', async (element) => {
      const objectSelect = this.dom.get('objectSelect');
      
      if (!objectSelect.value) {
        this.errorHandler.showWarning(CONFIG.ERRORS.NO_OBJECT_SELECTED);
        return;
      }

      this.dom.setLoadingState('btnPredictImpact', true);
      try {
        this.errorHandler.showInfo('Analyzing collision probabilities with nearby debris...');
        
        const noradId = parseInt(objectSelect.value);
        
        // Apelează endpoint-ul de predicție impact
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/debris/predict-impact`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ norad_id: noradId })
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const impactData = await response.json();
        
        console.log('Impact prediction data:', impactData);
        
        // Afișează rezultatele
        let resultHTML = `
          <div>
            <h4>💥 Impact Prediction Analysis</h4>
            <strong>Satellite:</strong> ${impactData.satellite.name}<br>
            <strong>Position:</strong> ${impactData.satellite.position.altitude_km.toFixed(2)} km altitude<br>
            <strong>Total Debris Tracked:</strong> ${impactData.total_debris_tracked}<br>
            <strong>Nearby Debris:</strong> ${impactData.nearby_debris_count}<br>
            <strong>Overall Risk:</strong> <span style="color: ${impactData.overall_risk === 'HIGH' ? 'red' : 'orange'};">${impactData.overall_risk}</span><br>
            <br>
            <strong>🚨 Top 5 High-Risk Debris:</strong><br>
        `;
        
        impactData.high_risk_debris.slice(0, 5).forEach((debris, index) => {
          const riskPercent = (debris.collision_probability * 100).toFixed(6);
          resultHTML += `
            <div style="margin: 5px 0; padding: 5px; background: rgba(255,255,255,0.1); border-radius: 3px;">
              ${index + 1}. <strong>${debris.name}</strong><br>
              &nbsp;&nbsp;&nbsp;Distance: ${debris.distance_km} km<br>
              &nbsp;&nbsp;&nbsp;Collision Prob: ${riskPercent}%<br>
              &nbsp;&nbsp;&nbsp;Size: ${debris.rcs_size}<br>
              &nbsp;&nbsp;&nbsp;Rel. Velocity: ${debris.relative_velocity_km_s.toFixed(2)} km/s
            </div>
          `;
        });
        
        resultHTML += `<br><small>Analysis time: ${impactData.timestamp}</small></div>`;
        
        this.dom.showResult('debrisResult', resultHTML);
        
        this.errorHandler.showSuccess('Impact prediction complete');
      } catch (error) {
        this.errorHandler.handleJsError(error, 'Predicting impact');
      } finally {
        this.dom.setLoadingState('btnPredictImpact', false);
      }
    });

    // Object selection change
    this.registerHandler('objectSelectionChanged', async (element) => {
      const noradId = element.value;
      if (noradId) {
        try {
          await this.api.getSatelliteDetails(parseInt(noradId));
        } catch (error) {
          // Error already handled by API manager
        }
      }
    });

    // Image classification
    this.registerHandler('classifyImage', async (element) => {
      const imageInput = this.dom.get('imageInput');
      
      if (!imageInput.files || imageInput.files.length === 0) {
        this.errorHandler.showWarning('Please select an image file');
        return;
      }

      this.dom.setLoadingState('btnDetect', true);
      try {
        this.dom.showResult('detectResult', 'Classifying image...');
        
        const formData = new FormData();
        formData.append('file', imageInput.files[0]);
        
        const result = await this.api.classifyImage(formData);
        this.dom.showResult('detectResult', `Classification: ${result.class} (${(result.confidence * 100).toFixed(1)}%)`);
      } finally {
        this.dom.setLoadingState('btnDetect', false);
      }
    });
  }

  // Helper method to format risk results
  formatRiskResult(data, riskPercent) {
    return `🛰️ ${data.name} (NORAD ${data.norad_id})\n` +
           `📍 Altitude: ${Number(data.altitude_km).toFixed(1)} km, Inclination: ${Number(data.inclination_deg).toFixed(1)}°\n\n` +
           `📊 RISK ANALYSIS:\n` +
           `🎯 Risk Level: ${data.risk_level}\n` +
           `📈 Collision Probability: ${riskPercent}%\n` +
           `⏱️ Analysis Period: ${data.duration_days} days\n` +
           `📐 Cross Section: ${data.cross_section_m2} m²\n\n` +
           `🌌 SPACE DEBRIS FLUX:\n` +
           `${data.flux_explanation}\n\n` +
           `💡 EXPLANATION:\n` +
           `${data.risk_explanation}\n\n` +
           `🔧 RECOMMENDATIONS:\n` +
           `• ${data.recommendations.monitoring}\n` +
           `• ${data.recommendations.maneuver}\n` +
           `• ${data.recommendations.shielding}`;
  }

  // Add custom handler
  addHandler(action, handler) {
    this.registerHandler(action, handler);
  }

  // Remove handler
  removeHandler(action) {
    this.handlers.delete(action);
  }

  // Cleanup
  destroy() {
    document.removeEventListener('click', this.handleClick);
    document.removeEventListener('change', this.handleChange);
    document.removeEventListener('submit', this.handleSubmit);
    this.handlers.clear();
    this.initialized = false;
  }
}

// Create global event manager instance
const Events = new EventManager(window.DOM || DOM, window.API || API, window.ErrorManager || ErrorManager);

// Make it globally available immediately
window.Events = Events;

console.log('✓ Event manager created and available globally');

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EventManager;
}