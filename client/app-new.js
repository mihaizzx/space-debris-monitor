// Main Application Initialization
(function() {
  'use strict';

  // Application State
  const AppState = {
    viewer: null,
    lastPropagation: null,
    leoEntity: null,
    allSatelliteEntities: [],
    debrisEntities: [],
    collisionEntities: [],
    
    // Clear all state
    clear() {
      this.debrisEntities = [];
      this.collisionEntities = [];
      this.allSatelliteEntities = [];
      this.lastPropagation = null;
      this.leoEntity = null;
    },
    
    // Update specific state
    update(type, data) {
      switch(type) {
        case 'propagation':
          this.lastPropagation = data;
          break;
        case 'debris':
          this.debrisEntities = data;
          break;
        case 'satellites':
          this.allSatelliteEntities = data;
          break;
        case 'leo':
          this.leoEntity = data;
          break;
      }
    }
  };

  // Make AppState globally available
  window.AppState = AppState;
  window.lastPropagation = null; // For backward compatibility

  // Initialize Cesium Viewer
  function initializeCesium() {
    try {
      console.log('Initializing Cesium...');
      
      // Check if token exists and is not empty/whitespace
      if (!window.CESIUM_ION_TOKEN || window.CESIUM_ION_TOKEN.trim() === '') {
        const errorMsg = '⚠️ Cesium Ion Access Token Missing!\n\n' +
                        'The 3D globe cannot be displayed without a valid Cesium Ion token.\n\n' +
                        'To fix this:\n' +
                        '1. Visit https://cesium.com/ion/tokens\n' +
                        '2. Create a FREE account\n' +
                        '3. Copy your access token\n' +
                        '4. Paste it in client/config.js\n\n' +
                        'For now, a default token has been provided, but it may not work.';
        
        alert(errorMsg);
        console.error('❌ CESIUM_ION_TOKEN is missing or empty!');
      } else {
        Cesium.Ion.defaultAccessToken = window.CESIUM_ION_TOKEN;
        console.log('✅ Ion token set:', window.CESIUM_ION_TOKEN.substring(0, 20) + '...');
      }

      // Use basic ellipsoid terrain - it's synchronous and always works
      const viewer = new Cesium.Viewer('cesiumContainer', {
        timeline: true,
        animation: true,
        baseLayerPicker: true,
        geocoder: false,
        terrainProvider: new Cesium.EllipsoidTerrainProvider()
      });

      console.log('Viewer created successfully');

      AppState.viewer = viewer;
      window.viewer = viewer; // For backward compatibility

      // Add event listener for entity clicks - display extended info panel
      viewer.selectedEntityChanged.addEventListener(function(selectedEntity) {
        if (selectedEntity && selectedEntity.properties && selectedEntity.properties.norad_id) {
          const noradId = selectedEntity.properties.norad_id;
          console.log('Entity clicked, fetching full info for NORAD:', noradId);
          
          // Fetch complete satellite information
          fetch(`${CONFIG.API_BASE_URL}/api/satellite/info/${noradId}`)
            .then(response => response.json())
            .then(info => {
              // Create HTML for extended info panel
              const htmlContent = `
                <div style="max-width: 500px; font-family: Arial, sans-serif;">
                  <h2 style="color: #0078d4; margin-top: 0;">${info.basic_info.name}</h2>
                  
                  <div style="background: #f5f5f5; padding: 10px; margin: 10px 0; border-radius: 5px;">
                    <h3 style="margin-top: 0;">📡 Basic Information</h3>
                    <p><strong>NORAD ID:</strong> ${info.basic_info.norad_id}</p>
                    <p><strong>Country:</strong> ${info.basic_info.country}</p>
                    <p><strong>Operator:</strong> ${info.mission_info.operator}</p>
                    <p><strong>Launch Date:</strong> ${info.basic_info.launch_date}</p>
                    <p><strong>Int'l Designator:</strong> ${info.basic_info.international_designator}</p>
                  </div>
                  
                  <div style="background: #e8f4f8; padding: 10px; margin: 10px 0; border-radius: 5px;">
                    <h3 style="margin-top: 0;">🛰️ Orbital Parameters (Real-time SGP4)</h3>
                    <p><strong>Altitude:</strong> ${info.current_state.altitude_km.toFixed(2)} km</p>
                    <p><strong>Inclination:</strong> ${info.orbital_parameters.inclination_deg.toFixed(2)}°</p>
                    <p><strong>Eccentricity:</strong> ${info.orbital_parameters.eccentricity.toFixed(6)}</p>
                    <p><strong>Orbital Period:</strong> ${info.orbital_parameters.orbital_period_minutes.toFixed(2)} minutes</p>
                    <p><strong>Apogee:</strong> ${info.orbital_parameters.apogee_km.toFixed(2)} km</p>
                    <p><strong>Perigee:</strong> ${info.orbital_parameters.perigee_km.toFixed(2)} km</p>
                    <p><strong>RAAN:</strong> ${info.orbital_parameters.raan_deg.toFixed(2)}°</p>
                    <p><strong>Arg of Perigee:</strong> ${info.orbital_parameters.argument_of_perigee_deg.toFixed(2)}°</p>
                    <p><strong>Mean Motion:</strong> ${info.orbital_parameters.mean_motion_rev_per_day.toFixed(4)} rev/day</p>
                  </div>
                  
                  <div style="background: #fff4e6; padding: 10px; margin: 10px 0; border-radius: 5px;">
                    <h3 style="margin-top: 0;">📍 Current State (${new Date().toUTCString()})</h3>
                    <p><strong>Latitude:</strong> ${info.current_state.latitude_deg.toFixed(4)}°</p>
                    <p><strong>Longitude:</strong> ${info.current_state.longitude_deg.toFixed(4)}°</p>
                    <p><strong>Velocity:</strong> ${info.current_state.velocity_km_s.toFixed(3)} km/s (${info.current_state.velocity_km_h.toFixed(0)} km/h)</p>
                    <p><strong>Timestamp:</strong> ${info.current_state.timestamp}</p>
                  </div>
                  
                  <div style="background: #f0e6ff; padding: 10px; margin: 10px 0; border-radius: 5px;">
                    <h3 style="margin-top: 0;">⚙️ Physical Characteristics</h3>
                    <p><strong>Mass:</strong> ${info.physical_characteristics.mass_kg} kg</p>
                    <p><strong>Dimensions:</strong> ${info.physical_characteristics.dimensions}</p>
                    <p><strong>Power:</strong> ${info.physical_characteristics.power_watts} W</p>
                    <p><strong>RCS Size:</strong> ${info.physical_characteristics.rcs_size}</p>
                  </div>
                  
                  <div style="background: #e6ffe6; padding: 10px; margin: 10px 0; border-radius: 5px;">
                    <h3 style="margin-top: 0;">🎯 Mission Information</h3>
                    <p><strong>Purpose:</strong> ${info.mission_info.purpose}</p>
                    <p><strong>Mission Type:</strong> ${info.mission_info.mission_type}</p>
                    <p><strong>Status:</strong> ${info.mission_info.status}</p>
                    <p><strong>Expected Lifetime:</strong> ${info.mission_info.expected_lifetime_years} years</p>
                  </div>
                  
                  <div style="background: #ffe6e6; padding: 10px; margin: 10px 0; border-radius: 5px;">
                    <h3 style="margin-top: 0;">🔗 External Tracking Links</h3>
                    <p><a href="${info.tracking_links.n2yo}" target="_blank">Track on N2YO</a></p>
                    <p><a href="${info.tracking_links.heavens_above}" target="_blank">Heavens Above</a></p>
                    <p><a href="${info.tracking_links.space_track}" target="_blank">Space-Track.org</a></p>
                    <p><a href="${info.tracking_links.celestrak}" target="_blank">Celestrak</a></p>
                  </div>
                  
                  <p style="font-size: 0.9em; color: #666; margin-top: 15px;">
                    <em>Data propagated using SGP4/SDP4 from NASA TLE elements</em>
                  </p>
                </div>
              `;
              
              // Set entity description to display in info panel
              selectedEntity.description = htmlContent;
            })
            .catch(error => {
              console.error('Failed to fetch satellite info:', error);
              selectedEntity.description = `<p>Error loading satellite information</p>`;
            });
        }
      });

      ErrorManager.showSuccess('Cesium 3D viewer initialized');
      ErrorManager.log('🌍 Cesium viewer ready');

      return viewer;
    } catch (error) {
      console.error('❌ Cesium initialization error:', error);
      
      // Show detailed error alert
      const errorMsg = '❌ Failed to Initialize 3D Globe!\n\n' +
                      'Error: ' + error.message + '\n\n' +
                      'Common causes:\n' +
                      '• Invalid or expired Cesium Ion token\n' +
                      '• Network connection issues\n' +
                      '• Browser compatibility problems\n\n' +
                      'Solution:\n' +
                      '1. Get a new token from https://cesium.com/ion/tokens\n' +
                      '2. Update client/config.js with your token\n' +
                      '3. Refresh the page\n\n' +
                      'Check browser console (F12) for more details.';
      
      alert(errorMsg);
      ErrorManager.handleJsError(error, 'Cesium initialization');
      throw error;
    }
  }

  // Simple Cesium Manager (placeholder for full implementation)
  const CesiumManager = {
    viewer: null,
    
    init(viewer) {
      this.viewer = viewer;
    },

    addOrbitEntity(propagation) {
      console.log('addOrbitEntity called with:', propagation);
      
      if (!this.viewer) {
        console.error('Viewer not initialized!');
        return;
      }
      
      if (!propagation) {
        console.error('No propagation data!');
        return;
      }

      try {
        // CRITICAL: Clear all entities first to avoid RangeError from corrupted data
        console.log('Clearing all entities before adding new satellite...');
        this.viewer.entities.removeAll();
        AppState.clear();
        console.log('Entities cleared successfully');
        
        console.log('Generating Cesium position property...');
        // Create position property using orbital calculator
        const property = OrbitalCalc.generateCesiumPositionProperty(
          propagation, 
          CONFIG.TRAIL_TIME_SECONDS
        );
        console.log('Position property created:', property);

        const entity = this.viewer.entities.add({
          id: `satellite_${propagation.norad_id}`,
          name: `${propagation.norad_id} ${propagation.name}`,
          position: property,
          point: { 
            pixelSize: CONFIG.DEFAULT_PIXEL_SIZE, 
            color: Cesium.Color.CYAN 
          },
          path: {
            material: Cesium.Color.YELLOW.withAlpha(0.7),
            width: CONFIG.PATH_WIDTH,
            leadTime: CONFIG.LEAD_TIME_SECONDS,
            trailTime: CONFIG.TRAIL_TIME_SECONDS
          },
          label: {
            text: `${propagation.norad_id} ${propagation.name}`,
            font: '12px sans-serif',
            fillColor: Cesium.Color.WHITE,
            showBackground: true,
            backgroundColor: Cesium.Color.BLACK.withAlpha(0.4),
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, CONFIG.LABEL_PIXEL_OFFSET_Y)
          }
        });

        // Set up time controls
        const start = Cesium.JulianDate.now();
        const stop = Cesium.JulianDate.addSeconds(start, CONFIG.TRAIL_TIME_SECONDS, new Cesium.JulianDate());
        
        this.viewer.clock.startTime = start.clone();
        this.viewer.clock.currentTime = start.clone();
        this.viewer.clock.stopTime = stop.clone();
        this.viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
        this.viewer.clock.multiplier = CONFIG.ANIMATION_SPEED_MULTIPLIER;
        this.viewer.trackedEntity = entity;

        AppState.update('propagation', propagation);
        window.lastPropagation = propagation; // Backward compatibility

        ErrorManager.log(`🛰️ Object added to scene: ${propagation.norad_id} ${propagation.name}`);
        return entity;
      } catch (error) {
        ErrorManager.handleJsError(error, 'Adding orbit entity');
      }
    },

    visualizeDebris(debrisObjects) {
      if (!this.viewer || !debrisObjects) return;

      try {
        this.clearDebris();
        
        debrisObjects.forEach((debris, index) => {
          const color = UTILS.getDebrisColor(debris.rcs_size);
          const size = UTILS.getDebrisSize(debris.rcs_size);
          
          // Use orbital calculator for positions
          const positions = OrbitalCalc.preCalculateOrbitPositions(debris, CONFIG.TRAIL_TIME_SECONDS * 1000);
          const property = new Cesium.SampledPositionProperty();
          
          const startTime = Cesium.JulianDate.now();
          positions.forEach((pos, i) => {
            const time = Cesium.JulianDate.addSeconds(startTime, i * 60, new Cesium.JulianDate());
            const cartesian = Cesium.Cartesian3.fromDegrees(
              pos.position.longitude,
              pos.position.latitude, 
              pos.position.altitude * 1000
            );
            property.addSample(time, cartesian);
          });

          const entity = this.viewer.entities.add({
            id: `debris_${debris.norad_id}`,
            name: `🗑️ ${debris.name}`,
            position: property,
            point: {
              pixelSize: size,
              color: Cesium.Color.fromCssColorString(color),
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 1
            },
            path: {
              material: Cesium.Color.fromCssColorString(CONFIG.COLORS.DEBRIS_TRAJECTORY),
              width: 1,
              trailTime: 1800
            }
          });

          AppState.debrisEntities.push(entity);
        });

        ErrorManager.showSuccess(`Visualized ${debrisObjects.length} debris objects`);
      } catch (error) {
        ErrorManager.handleJsError(error, 'Visualizing debris');
      }
    },

    clearDebris() {
      if (!this.viewer) return;
      
      AppState.debrisEntities.forEach(entity => {
        this.viewer.entities.remove(entity);
      });
      AppState.debrisEntities = [];
    },

    clearAll() {
      if (!this.viewer) return;
      
      this.viewer.entities.removeAll();
      AppState.clear();
    },

    async showNASARiskZones() {
      if (!this.viewer) return;
      
      try {
        ErrorManager.log('Fetching NASA ORDEM risk zones...');
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/debris/risk-zones`);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        console.log('Risk zones data:', data);
        
        if (!data || !data.zones || !Array.isArray(data.zones)) {
          throw new Error('Invalid risk zones data received from server');
        }
        
        // Șterge zonele existente
        AppState.riskZoneEntities = AppState.riskZoneEntities || [];
        AppState.riskZoneEntities.forEach(entity => this.viewer.entities.remove(entity));
        AppState.riskZoneEntities = [];
        
        // Afișează fiecare zonă de risc ca puncte discrete în jurul orbitei
        data.zones.forEach((zone, zoneIndex) => {
          const [minAlt, maxAlt] = zone.altitude_range_km;
          const avgAlt = (minAlt + maxAlt) / 2;
          
          console.log(`Creating risk zone: ${zone.name} at ${minAlt}-${maxAlt} km`);
          
          const earthRadius = 6371; // km
          const orbitRadius = earthRadius + avgAlt;
          
          // Creează puncte de risc de-a lungul orbitei
          // Distribuie puncte în funcție de inclinație dominantă
          const inclination = zone.dominant_inclination;
          const numPoints = 50; // puncte pe orbită
          
          for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * 2 * Math.PI;
            
            // Calculează poziția pe orbită cu inclinație
            const x = orbitRadius * Math.cos(angle);
            const y = orbitRadius * Math.sin(angle) * Math.cos(inclination * Math.PI / 180);
            const z = orbitRadius * Math.sin(angle) * Math.sin(inclination * Math.PI / 180);
            
            // Convertește în coordonate Cartesian3
            const position = new Cesium.Cartesian3(x * 1000, y * 1000, z * 1000);
            
            // Intensitatea culorii bazată pe risk level
            const alphaValues = { 'CRITICAL': 0.8, 'VERY HIGH': 0.6, 'HIGH': 0.5, 'MODERATE': 0.4, 'ELEVATED': 0.3 };
            const alpha = alphaValues[zone.risk_level] || 0.5;
            
            // Creează punct de risc
            const entity = this.viewer.entities.add({
              name: i === 0 ? `🚨 ${zone.name} - ${zone.total_debris_tracked} tracked` : `Risk Point ${i}`,
              description: i === 0 ? `
                <h3>🚨 ${zone.name}</h3>
                <p><strong>Risk Level:</strong> <span style="color:${zone.color}">${zone.risk_level}</span></p>
                <p><strong>Altitude:</strong> ${minAlt}-${maxAlt} km (center: ${zone.center_altitude_km} km)</p>
                <hr>
                <h4>📊 NASA ORDEM Data:</h4>
                <p><strong>Flux ORDEM:</strong> ${zone.nasa_ordem_flux}</p>
                <p><strong>Densitate Suprafață:</strong> ${zone.debris_per_km2}</p>
                <p><strong>Estimare Anuală:</strong> ~${zone.estimated_debris_per_year} impacte/an</p>
                <p><strong>Tip Orbită:</strong> ${zone.orbit_type}</p>
                <p><strong>Inclinație Dominantă:</strong> ${zone.dominant_inclination}°</p>
                <hr>
                <h4>🛰️ Debris Tracked:</h4>
                <p><strong>Total Tracked:</strong> ${zone.total_debris_tracked} obiecte</p>
                <p><strong>Large:</strong> ${zone.large_debris} 🔴 | <strong>Medium:</strong> ${zone.medium_debris} 🟠 | <strong>Small:</strong> ${zone.small_debris} 🟡</p>
                <p><strong>Sursa Principală:</strong> ${zone.primary_source}</p>
                <hr>
                <p><em>${zone.description}</em></p>
                <p><small>Data source: <a href="https://orbitaldebris.jsc.nasa.gov/" target="_blank">NASA Orbital Debris Program Office</a></small></p>
              ` : undefined,
              position: position,
              point: {
                pixelSize: i === 0 ? 10 : 6,
                color: Cesium.Color.fromCssColorString(zone.color).withAlpha(alpha),
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: i === 0 ? 2 : 1
              },
              label: i === 0 ? {
                text: zone.name,
                font: '11px sans-serif bold',
                fillColor: Cesium.Color.WHITE,
                showBackground: true,
                backgroundColor: Cesium.Color.fromCssColorString(zone.color).withAlpha(0.7),
                pixelOffset: new Cesium.Cartesian2(0, -15),
                scale: 0.9
              } : undefined
            });
            
            AppState.riskZoneEntities.push(entity);
          }
        });
        
        ErrorManager.showSuccess(`Displayed ${data.zones.length} NASA ORDEM risk zones`);
      } catch (error) {
        ErrorManager.handleJsError(error, 'Showing NASA risk zones');
      }
    },

    async showAllSatellites() {
      if (!this.viewer) return;
      
      try {
        // Verifică dacă există date TLE
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/objects`);
        if (!response.ok) {
          throw new Error(`Failed to fetch objects: ${response.status}`);
        }
        
        const data = await response.json();
        const objects = data.objects || [];
        
        if (!objects || objects.length === 0) {
          ErrorManager.showError('No TLE data loaded. Please load TLE data first (click "Load TLE Data" or "Active Satellites").');
          return;
        }
        
        // Citește setările utilizatorului
        const satelliteCountInput = document.getElementById('satelliteCount');
        const withOrbitsCheckbox = document.getElementById('withOrbits');
        const maxSatellites = Math.min(parseInt(satelliteCountInput?.value || 50), objects.length);
        const withOrbits = withOrbitsCheckbox?.checked || false;
        
        if (withOrbits && maxSatellites > 10) {
          console.log(`⚠️ Many satellites with orbits (${maxSatellites}), but continuing without confirmation`);
          // Removed confirmation dialog
        }
        
        ErrorManager.log(`Visualizing ${maxSatellites} satellites${withOrbits ? ' with real orbits' : ' as points'}...`);
        
        // Șterge sateliții existenți
        AppState.allSatelliteEntities = AppState.allSatelliteEntities || [];
        AppState.allSatelliteEntities.forEach(entity => this.viewer.entities.remove(entity));
        AppState.allSatelliteEntities = [];
        
        if (withOrbits) {
          // Mod cu orbite reale SGP4 (propagare precisă NASA)
          for (let i = 0; i < maxSatellites; i++) {
            const obj = objects[i];
            
            try {
              ErrorManager.log(`Propagating orbit ${i + 1}/${maxSatellites}: ${obj.name} using SGP4...`);
              
              // Folosește noul endpoint cu traiectorii SGP4 reale
              const response = await fetch(`${CONFIG.API_BASE_URL}/api/satellite/trajectory/${obj.norad_id}?duration_seconds=7200&samples=120`);
              if (!response.ok) {
                throw new Error(`Failed to fetch trajectory: ${response.status}`);
              }
              
              const trajectoryData = await response.json();
              
              // Convertește traiectoria SGP4 în SampledPositionProperty Cesium
              const property = new Cesium.SampledPositionProperty();
              const startTime = Cesium.JulianDate.now();
              
              trajectoryData.trajectory.forEach((point, idx) => {
                const time = Cesium.JulianDate.addSeconds(
                  startTime,
                  (idx / trajectoryData.trajectory.length) * 7200,
                  new Cesium.JulianDate()
                );
                
                const position = Cesium.Cartesian3.fromDegrees(
                  point.longitude_deg,
                  point.latitude_deg,
                  point.altitude_km * 1000 // Convert to meters
                );
                
                property.addSample(time, position);
              });
              
              // Culori strălucitoare și mai vizibile
              const hue = (i / maxSatellites) * 360;
              const color = Cesium.Color.fromHsl(hue / 360, 1.0, 0.6); // Luminozitate crescută
              
              const entity = this.viewer.entities.add({
                id: `all_sat_${obj.norad_id}`,
                name: obj.name,
                position: property,
                point: {
                  pixelSize: 10, // Mai mari pentru vizibilitate
                  color: color,
                  outlineColor: Cesium.Color.WHITE,
                  outlineWidth: 3 // Contur mai gros
                },
                path: {
                  material: color.withAlpha(0.8), // Trail mai vizibil
                  width: 3, // Linie mai groasă
                  resolution: 120,
                  leadTime: 0,
                  trailTime: 7200
                },
                label: {
                  text: obj.name,
                  font: 'bold 11px sans-serif', // Font bold
                  fillColor: Cesium.Color.YELLOW, // Text galben strălucitor
                  outlineColor: Cesium.Color.BLACK,
                  outlineWidth: 3, // Contur text pentru contrast
                  showBackground: true,
                  backgroundColor: Cesium.Color.BLACK.withAlpha(0.8), // Fundal mai opac
                  backgroundPadding: new Cesium.Cartesian2(8, 4),
                  pixelOffset: new Cesium.Cartesian2(0, -12),
                  scale: 0.9
                },
                description: `<div style="padding:10px;">
                  <h3>${obj.name}</h3>
                  <p><strong>NORAD ID:</strong> ${obj.norad_id}</p>
                  <p><strong>SGP4 Propagation:</strong> Real-time NASA coordinates</p>
                  <p><em>Click for full details...</em></p>
                </div>`,
                // Stochează NORAD ID pentru info panel
                properties: {
                  norad_id: obj.norad_id,
                  satellite_name: obj.name
                }
              });
              
              AppState.allSatelliteEntities.push(entity);
            } catch (error) {
              console.warn(`Failed to propagate satellite ${obj.norad_id}:`, error);
            }
          }
          
          // Setup clock for animation (IMPORTANT: do this ONCE after all satellites added)
          if (withOrbits && AppState.allSatelliteEntities.length > 0) {
            const start = Cesium.JulianDate.now();
            const stop = Cesium.JulianDate.addSeconds(start, 7200, new Cesium.JulianDate());
            
            this.viewer.clock.startTime = start.clone();
            this.viewer.clock.currentTime = start.clone();
            this.viewer.clock.stopTime = stop.clone();
            this.viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
            this.viewer.clock.multiplier = 60; // 60x speed
            this.viewer.clock.shouldAnimate = true;
            
            console.log('✅ Clock setup complete for animation');
          }
        } else {
          // Mod rapid - puncte statice
          for (let i = 0; i < maxSatellites; i++) {
            const obj = objects[i];
            
            try {
              // Culoare bazată pe index (rainbow gradient) - luminozitate mai mare pentru vizibilitate
              const hue = (i / maxSatellites) * 360;
              const color = Cesium.Color.fromHsl(hue / 360, 1.0, 0.6); // 0.6 instead of 0.5 for brighter colors
              
              // Poziție simulată în LEO
              const altitude = 400 + Math.random() * 1600; // 400-2000 km (LEO)
              const lat = (Math.random() - 0.5) * 180;
              const lon = (Math.random() - 0.5) * 360;
              
              const entity = this.viewer.entities.add({
                id: `all_sat_${obj.norad_id}`,
                name: obj.name,
                position: Cesium.Cartesian3.fromDegrees(lon, lat, altitude * 1000),
                point: {
                  pixelSize: 10,
                  color: color,
                  outlineColor: Cesium.Color.WHITE,
                  outlineWidth: 3
                },
                label: {
                  text: obj.name,
                  font: 'bold 11px sans-serif',
                  fillColor: Cesium.Color.YELLOW,
                  outlineColor: Cesium.Color.BLACK,
                  outlineWidth: 3,
                  showBackground: true,
                  backgroundColor: Cesium.Color.BLACK.withAlpha(0.8),
                  backgroundPadding: new Cesium.Cartesian2(8, 4),
                  pixelOffset: new Cesium.Cartesian2(0, -12),
                  scale: 1.0,
                  distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 10000000)
                }
              });
              
              AppState.allSatelliteEntities.push(entity);
            } catch (error) {
              console.warn(`Failed to add satellite ${obj.norad_id}:`, error);
            }
          }
        }
        
        ErrorManager.showSuccess(`Visualized ${AppState.allSatelliteEntities.length} satellites${withOrbits ? ' with real orbits' : ''}`);
      } catch (error) {
        ErrorManager.handleJsError(error, 'Showing all satellites');
      }
    },

    async showLEOSatellites() {
      if (!this.viewer) return;
      
      try {
        // Verifică dacă există date TLE
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/objects`);
        if (!response.ok) {
          throw new Error(`Failed to fetch objects: ${response.status}`);
        }
        
        const data = await response.json();
        const objects = data.objects || [];
        
        if (!objects || objects.length === 0) {
          ErrorManager.showError('No TLE data loaded. Please load TLE data first (click "Load TLE Data" or "Active Satellites").');
          return;
        }
        
        // Citește setările utilizatorului pentru LEO
        const leoCountInput = document.getElementById('leoSatelliteCount');
        const leoWithOrbitsCheckbox = document.getElementById('leoWithOrbits');
        const maxLEOSatellites = Math.min(parseInt(leoCountInput?.value || 30), objects.length);
        const withOrbits = leoWithOrbitsCheckbox?.checked || false;
        
        if (withOrbits && maxLEOSatellites > 10) {
          console.log(`⚠️ Many LEO satellites with orbits (${maxLEOSatellites}), but continuing without confirmation`);
          // Removed confirmation dialog
        }
        
        ErrorManager.log(`Showing ${maxLEOSatellites} LEO satellites (< 2000 km)${withOrbits ? ' with real SGP4 orbits' : ''}...`);
        
        // Șterge sateliții LEO existenți
        AppState.leoSatelliteEntities = AppState.leoSatelliteEntities || [];
        AppState.leoSatelliteEntities.forEach(entity => this.viewer.entities.remove(entity));
        AppState.leoSatelliteEntities = [];
        
        let leoCount = 0;
        
        if (withOrbits) {
          // Mod cu orbite SGP4 reale
          for (let i = 0; i < maxLEOSatellites; i++) {
            const obj = objects[i];
            
            try {
              ErrorManager.log(`Propagating LEO orbit ${i + 1}/${maxLEOSatellites}: ${obj.name}...`);
              
              // Fetch traiectorie SGP4 reală
              const trajResponse = await fetch(`${CONFIG.API_BASE_URL}/api/satellite/trajectory/${obj.norad_id}?duration_seconds=7200&samples=120`);
              if (!trajResponse.ok) continue;
              
              const trajectoryData = await trajResponse.json();
              
              // Verifică dacă e LEO (< 2000 km)
              const avgAlt = trajectoryData.trajectory.reduce((sum, p) => sum + p.altitude_km, 0) / trajectoryData.trajectory.length;
              if (avgAlt > 2000) continue; // Skip non-LEO
              
              // Convertește în SampledPositionProperty
              const property = new Cesium.SampledPositionProperty();
              const startTime = Cesium.JulianDate.now();
              
              trajectoryData.trajectory.forEach((point, idx) => {
                const time = Cesium.JulianDate.addSeconds(
                  startTime,
                  (idx / trajectoryData.trajectory.length) * 7200,
                  new Cesium.JulianDate()
                );
                
                const position = Cesium.Cartesian3.fromDegrees(
                  point.longitude_deg,
                  point.latitude_deg,
                  point.altitude_km * 1000
                );
                
                property.addSample(time, position);
              });
              
              const entity = this.viewer.entities.add({
                id: `leo_sat_${obj.norad_id}`,
                name: `${obj.name} (LEO)`,
                position: property,
                point: {
                  pixelSize: 10, // Mai mare
                  color: Cesium.Color.AQUA, // Aqua strălucitor în loc de cyan
                  outlineColor: Cesium.Color.WHITE,
                  outlineWidth: 3 // Contur mai gros
                },
                path: {
                  material: Cesium.Color.AQUA.withAlpha(0.8), // Trail mai vizibil
                  width: 3, // Linie mai groasă
                  resolution: 120,
                  leadTime: 0,
                  trailTime: 7200
                },
                label: {
                  text: obj.name,
                  font: 'bold 11px sans-serif', // Font bold
                  fillColor: Cesium.Color.WHITE,
                  outlineColor: Cesium.Color.BLACK,
                  outlineWidth: 3, // Contur text
                  showBackground: true,
                  backgroundColor: Cesium.Color.AQUA.withAlpha(0.8), // Fundal mai opac
                  backgroundPadding: new Cesium.Cartesian2(8, 4),
                  pixelOffset: new Cesium.Cartesian2(0, -12),
                  scale: 0.9
                },
                properties: {
                  norad_id: obj.norad_id,
                  satellite_name: obj.name
                }
              });
              
              AppState.leoSatelliteEntities.push(entity);
              leoCount++;
            } catch (error) {
              console.warn(`Failed to add LEO satellite ${obj.norad_id}:`, error);
            }
          }
        } else {
          // Mod rapid - puncte statice
          for (let i = 0; i < maxLEOSatellites; i++) {
            const obj = objects[i];
            
            try {
              // Simulăm poziție LEO (400-2000 km)
              const altitude = 400 + Math.random() * 1600;
              const lat = (Math.random() - 0.5) * 120;
              const lon = (Math.random() - 0.5) * 360;
              
              const entity = this.viewer.entities.add({
                id: `leo_sat_${obj.norad_id}`,
                name: `${obj.name} (LEO)`,
                position: Cesium.Cartesian3.fromDegrees(lon, lat, altitude * 1000),
                point: {
                  pixelSize: 10,
                  color: Cesium.Color.AQUA,
                  outlineColor: Cesium.Color.WHITE,
                  outlineWidth: 3
                },
                label: {
                  text: obj.name,
                  font: 'bold 11px sans-serif',
                  fillColor: Cesium.Color.WHITE,
                  outlineColor: Cesium.Color.BLACK,
                  outlineWidth: 3,
                  showBackground: true,
                  backgroundColor: Cesium.Color.AQUA.withAlpha(0.8),
                  backgroundPadding: new Cesium.Cartesian2(8, 4),
                  pixelOffset: new Cesium.Cartesian2(0, -12),
                  scale: 1.0
                },
                properties: {
                  norad_id: obj.norad_id,
                  satellite_name: obj.name
                }
              });
              
              AppState.leoSatelliteEntities.push(entity);
              leoCount++;
            } catch (error) {
              console.warn(`Failed to add LEO satellite ${obj.norad_id}:`, error);
            }
          }
          
          // Setup clock for animation
          if (withOrbits && leoCount > 0) {
            const start = Cesium.JulianDate.now();
            const stop = Cesium.JulianDate.addSeconds(start, 7200, new Cesium.JulianDate());
            
            this.viewer.clock.startTime = start.clone();
            this.viewer.clock.currentTime = start.clone();
            this.viewer.clock.stopTime = stop.clone();
            this.viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
            this.viewer.clock.multiplier = 60;
            this.viewer.clock.shouldAnimate = true;
            
            console.log('✅ LEO Clock setup complete for animation');
          }
        }
        
        ErrorManager.showSuccess(`Visualized ${leoCount} LEO satellites (< 2000 km)${withOrbits ? ' with SGP4 orbits' : ''}`);
      } catch (error) {
        ErrorManager.handleJsError(error, 'Showing LEO satellites');
      }
    },

    async showNonLEOSatellites() {
      console.log('🚀 showNonLEOSatellites called');
      if (!this.viewer) {
        console.log('❌ No viewer available');
        return;
      }
      
      try {
        console.log('📡 Fetching objects from API...');
        // Verifică dacă există date TLE
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/objects`);
        console.log('📍 Response status:', response.status);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch objects: ${response.status}`);
        }
        
        const data = await response.json();
        const objects = data.objects || [];
        console.log('📍 Objects loaded:', objects.length);
        
        if (!objects || objects.length === 0) {
          console.log('❌ No objects available');
          ErrorManager.showError('No TLE data loaded. Please load TLE data first (click "Load TLE Data" or "Active Satellites").');
          return;
        }
        
        // Citește setările utilizatorului pentru Non-LEO
        const nonLeoCountInput = document.getElementById('nonLeoSatelliteCount');
        const nonLeoWithOrbitsCheckbox = document.getElementById('nonLeoWithOrbits');
        console.log('📍 Input element:', nonLeoCountInput, 'value:', nonLeoCountInput?.value);
        console.log('📍 Checkbox element:', nonLeoWithOrbitsCheckbox, 'checked:', nonLeoWithOrbitsCheckbox?.checked);
        
        const maxNonLEOSatellites = Math.min(parseInt(nonLeoCountInput?.value || 20), objects.length);
        const withOrbits = nonLeoWithOrbitsCheckbox?.checked || false;
        
        console.log('📍 Settings - Count:', maxNonLEOSatellites, 'WithOrbits:', withOrbits);
        
        if (withOrbits && maxNonLEOSatellites > 10) {
          console.log('⚠️ Too many satellites with orbits, skipping confirm for now');
          // Removing confirmation for now
          // const confirm = window.confirm(`You selected ${maxNonLEOSatellites} Non-LEO satellites with real SGP4 orbits. This may take a while.\n\nRecommended: max 10 satellites with orbits.\n\nContinue anyway?`);
          // if (!confirm) return;
        }
        
        console.log('✅ Starting visualization...');
        ErrorManager.log(`Showing ${maxNonLEOSatellites} Non-LEO satellites (> 2000 km)${withOrbits ? ' with real SGP4 orbits' : ''}...`);
        
        // Șterge sateliții Non-LEO existenți
        AppState.nonLeoSatelliteEntities = AppState.nonLeoSatelliteEntities || [];
        AppState.nonLeoSatelliteEntities.forEach(entity => this.viewer.entities.remove(entity));
        AppState.nonLeoSatelliteEntities = [];
        
        let nonLeoCount = 0;
        
        if (withOrbits) {
          console.log('🛰️ Starting orbit mode with', maxNonLEOSatellites, 'satellites');
          // Mod cu orbite SGP4 reale
          for (let i = 0; i < maxNonLEOSatellites; i++) {
            const obj = objects[i];
            console.log(`📡 Processing satellite ${i + 1}/${maxNonLEOSatellites}:`, obj.name, 'NORAD:', obj.norad_id);
            
            try {
              ErrorManager.log(`Propagating Non-LEO orbit ${i + 1}/${maxNonLEOSatellites}: ${obj.name}...`);
              
              // Fetch traiectorie SGP4 reală
              const trajUrl = `${CONFIG.API_BASE_URL}/api/satellite/trajectory/${obj.norad_id}?duration_seconds=7200&samples=120`;
              console.log('🔗 Fetching trajectory from:', trajUrl);
              const trajResponse = await fetch(trajUrl);
              console.log('📍 Trajectory response status:', trajResponse.status);
              if (!trajResponse.ok) {
                console.log('❌ Trajectory fetch failed for', obj.name);
                continue;
              }
              
              const trajectoryData = await trajResponse.json();
              
              // Verifică dacă e Non-LEO (> 2000 km)
              const avgAlt = trajectoryData.trajectory.reduce((sum, p) => sum + p.altitude_km, 0) / trajectoryData.trajectory.length;
              if (avgAlt <= 2000) continue; // Skip LEO
              
              // Convertește în SampledPositionProperty
              const property = new Cesium.SampledPositionProperty();
              const startTime = Cesium.JulianDate.now();
              
              trajectoryData.trajectory.forEach((point, idx) => {
                const time = Cesium.JulianDate.addSeconds(
                  startTime,
                  (idx / trajectoryData.trajectory.length) * 7200,
                  new Cesium.JulianDate()
                );
                
                const position = Cesium.Cartesian3.fromDegrees(
                  point.longitude_deg,
                  point.latitude_deg,
                  point.altitude_km * 1000
                );
                
                property.addSample(time, position);
              });
              
              const entity = this.viewer.entities.add({
                id: `nonleo_sat_${obj.norad_id}`,
                name: `${obj.name} (Non-LEO)`,
                position: property,
                point: {
                  pixelSize: 12, // Cele mai mari pentru Non-LEO
                  color: Cesium.Color.DARKORANGE, // Portocaliu intens
                  outlineColor: Cesium.Color.YELLOW, // Contur galben pentru contrast
                  outlineWidth: 3
                },
                path: {
                  material: Cesium.Color.DARKORANGE.withAlpha(0.9), // Trail foarte vizibil
                  width: 4, // Cel mai gros trail
                  resolution: 120,
                  leadTime: 0,
                  trailTime: 7200
                },
                label: {
                  text: obj.name,
                  font: 'bold 12px sans-serif', // Cel mai mare font
                  fillColor: Cesium.Color.YELLOW, // Text galben strălucitor
                  outlineColor: Cesium.Color.BLACK,
                  outlineWidth: 4, // Contur text gros
                  showBackground: true,
                  backgroundColor: Cesium.Color.DARKORANGE.withAlpha(0.9), // Fundal opac
                  backgroundPadding: new Cesium.Cartesian2(10, 5),
                  pixelOffset: new Cesium.Cartesian2(0, -15),
                  scale: 1.0
                },
                properties: {
                  norad_id: obj.norad_id,
                  satellite_name: obj.name
                }
              });
              
              AppState.nonLeoSatelliteEntities.push(entity);
              nonLeoCount++;
            } catch (error) {
              console.warn(`Failed to add Non-LEO satellite ${obj.norad_id}:`, error);
            }
          }
        } else {
          // Mod rapid - puncte statice
          for (let i = 0; i < maxNonLEOSatellites; i++) {
            const obj = objects[i];
            
            try {
              // Simulăm poziție Non-LEO (2000-36000 km - MEO și GEO)
              const altitude = 2000 + Math.random() * 34000;
              const lat = (Math.random() - 0.5) * 60;
              const lon = (Math.random() - 0.5) * 360;
              
              const entity = this.viewer.entities.add({
                id: `nonleo_sat_${obj.norad_id}`,
                name: `${obj.name} (Non-LEO)`,
                position: Cesium.Cartesian3.fromDegrees(lon, lat, altitude * 1000),
                point: {
                  pixelSize: 12,
                  color: Cesium.Color.DARKORANGE,
                  outlineColor: Cesium.Color.YELLOW,
                  outlineWidth: 3
                },
                label: {
                  text: obj.name,
                  font: 'bold 12px sans-serif',
                  fillColor: Cesium.Color.YELLOW,
                  outlineColor: Cesium.Color.BLACK,
                  outlineWidth: 4,
                  showBackground: true,
                  backgroundColor: Cesium.Color.DARKORANGE.withAlpha(0.9),
                  backgroundPadding: new Cesium.Cartesian2(10, 5),
                  pixelOffset: new Cesium.Cartesian2(0, -15),
                  scale: 1.0
                },
                properties: {
                  norad_id: obj.norad_id,
                  satellite_name: obj.name
                }
              });
              
              AppState.nonLeoSatelliteEntities.push(entity);
              nonLeoCount++;
            } catch (error) {
              console.warn(`Failed to add Non-LEO satellite ${obj.norad_id}:`, error);
            }
          }
          
          // Setup clock for animation
          if (withOrbits && nonLeoCount > 0) {
            const start = Cesium.JulianDate.now();
            const stop = Cesium.JulianDate.addSeconds(start, 7200, new Cesium.JulianDate());
            
            this.viewer.clock.startTime = start.clone();
            this.viewer.clock.currentTime = start.clone();
            this.viewer.clock.stopTime = stop.clone();
            this.viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
            this.viewer.clock.multiplier = 60;
            this.viewer.clock.shouldAnimate = true;
            
            console.log('✅ Non-LEO Clock setup complete for animation');
          }
        }
        
        ErrorManager.showSuccess(`Visualized ${nonLeoCount} Non-LEO satellites (> 2000 km)${withOrbits ? ' with SGP4 orbits' : ''}`);
      } catch (error) {
        ErrorManager.handleJsError(error, 'Showing Non-LEO satellites');
      }
    },

    toggleLEOVisualization() {
      if (!this.viewer) return;
      
      // Verifică dacă boundary-ul LEO există deja
      AppState.leoBoundary = AppState.leoBoundary || null;
      
      if (AppState.leoBoundary) {
        // Șterge boundary-ul
        this.viewer.entities.remove(AppState.leoBoundary);
        AppState.leoBoundary = null;
        ErrorManager.log('LEO boundary hidden');
      } else {
        // Creează boundary-ul LEO la 2000 km
        const leoAltitudeKm = 2000;
        
        AppState.leoBoundary = this.viewer.entities.add({
          name: 'LEO Boundary (2000 km)',
          position: Cesium.Cartesian3.fromDegrees(0, 0, leoAltitudeKm * 1000),
          ellipse: {
            semiMinorAxis: 6371000 + leoAltitudeKm * 1000,
            semiMajorAxis: 6371000 + leoAltitudeKm * 1000,
            height: leoAltitudeKm * 1000,
            material: Cesium.Color.YELLOW.withAlpha(0.2),
            outline: true,
            outlineColor: Cesium.Color.YELLOW,
            outlineWidth: 3
          },
          description: `
            <h3>Low Earth Orbit (LEO) Boundary</h3>
            <p><strong>Altitude:</strong> ${leoAltitudeKm} km</p>
            <p>LEO is the region of space within 2,000 km of Earth's surface.</p>
            <p>Most satellites and the ISS operate in this zone.</p>
          `
        });
        
        ErrorManager.showSuccess('LEO boundary displayed at 2000 km');
      }
    }
  };

  // Make CesiumManager globally available
  window.CesiumManager = CesiumManager;

  // Application initialization
  function initializeApp() {
    try {
      console.log('=== APP INIT START ===');
      console.log('CONFIG:', typeof CONFIG !== 'undefined' ? CONFIG : 'UNDEFINED');
      console.log('DOM:', typeof DOM !== 'undefined' ? 'OK' : 'UNDEFINED');
      console.log('ErrorManager:', typeof ErrorManager !== 'undefined' ? 'OK' : 'UNDEFINED');
      console.log('API:', typeof API !== 'undefined' ? 'OK' : 'UNDEFINED');
      console.log('Events:', typeof Events !== 'undefined' ? 'OK' : 'UNDEFINED');
      console.log('Cesium:', typeof Cesium !== 'undefined' ? 'OK' : 'UNDEFINED');
      
      ErrorManager.log('🚀 Initializing Space Debris NASA Demo...');

      // Initialize DOM cache
      DOM.init();
      ErrorManager.init(DOM.get('log'));
      console.log('DOM initialized');

      // Initialize Cesium
      console.log('Initializing Cesium...');
      const viewer = initializeCesium();
      console.log('Cesium viewer created:', viewer ? 'OK' : 'FAIL');
      CesiumManager.init(viewer);
      console.log('CesiumManager initialized');

      // Initialize event management
      console.log('Initializing events...');
      Events.init();
      console.log('Events initialized');

      // Hide welcome overlay after a delay
      setTimeout(() => {
        const welcome = document.getElementById('welcome');
        if (welcome) {
          welcome.classList.add('hide-welcome');
        }
      }, 3000);

      ErrorManager.showSuccess('Application initialized successfully');
      ErrorManager.log('✅ All systems ready');

    } catch (error) {
      ErrorManager.handleJsError(error, 'Application initialization');
    }
  }

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
  } else {
    initializeApp();
  }

  // Global error handling
  window.addEventListener('error', (event) => {
    ErrorManager.handleJsError(event.error, 'Global window error');
  });

  window.addEventListener('unhandledrejection', (event) => {
    ErrorManager.handleJsError(event.reason, 'Unhandled promise rejection');
  });

})();