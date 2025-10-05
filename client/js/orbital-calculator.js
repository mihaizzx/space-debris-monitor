// Optimized Orbital Calculations with Memoization and Performance Improvements
class OrbitalCalculator {
  constructor() {
    this.cache = new Map();
    this.positionCache = new Map();
    this.maxCacheSize = 1000;
    this.cacheTimeout = 300000; // 5 minutes
  }

  // Clear expired cache entries
  cleanCache() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.cacheTimeout) {
        this.cache.delete(key);
      }
    }
    for (const [key, value] of this.positionCache.entries()) {
      if (now - value.timestamp > this.cacheTimeout) {
        this.positionCache.delete(key);
      }
    }
  }

  // Get from cache or calculate
  getCachedOrCalculate(key, calculationFn) {
    // Clean cache periodically
    if (this.cache.size > this.maxCacheSize) {
      this.cleanCache();
    }

    const cached = this.cache.get(key);
    if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
      return cached.value;
    }

    const result = calculationFn();
    this.cache.set(key, {
      value: result,
      timestamp: Date.now()
    });

    return result;
  }

  // Pre-calculate orbital positions for animation
  preCalculateOrbitPositions(satellite, timeSpan, sampleCount = CONFIG.ORBIT_SAMPLE_POINTS) {
    const cacheKey = `orbit_${satellite.norad_id}_${timeSpan}_${sampleCount}`;
    
    return this.getCachedOrCalculate(cacheKey, () => {
      const positions = [];
      const startTime = Date.now();
      const timeStep = timeSpan / sampleCount;

      for (let i = 0; i <= sampleCount; i++) {
        const time = startTime + (i * timeStep);
        const position = this.calculatePositionAtTime(satellite, time);
        positions.push({
          time: time,
          position: position,
          cartesian: this.sphericalToCartesian(position.latitude, position.longitude, position.altitude)
        });
      }

      return positions;
    });
  }

  // Calculate orbital position at specific time
  calculatePositionAtTime(satellite, time) {
    const cacheKey = `pos_${satellite.norad_id}_${time}`;
    
    return this.getCachedOrCalculate(cacheKey, () => {
      // Simplified orbital mechanics calculation
      const meanMotion = satellite.mean_motion || 15.5; // revolutions per day
      const inclination = satellite.inclination || 0;
      const eccentricity = satellite.eccentricity || 0;
      
      // Calculate mean anomaly
      const timeFromEpoch = (time - satellite.epoch_time) / (1000 * 60 * 60 * 24); // days
      const meanAnomaly = (satellite.mean_anomaly + meanMotion * 360 * timeFromEpoch) % 360;
      
      // Simple approximation for true anomaly (ignoring eccentricity for speed)
      const trueAnomaly = meanAnomaly + 2 * eccentricity * Math.sin(UTILS.degToRad(meanAnomaly)) * 180 / Math.PI;
      
      // Calculate position
      const semiMajorAxis = Math.pow(CONFIG.GRAVITATIONAL_PARAMETER / Math.pow(meanMotion * 2 * Math.PI / 86400, 2), 1/3);
      const radius = semiMajorAxis * (1 - eccentricity * Math.cos(UTILS.degToRad(meanAnomaly)));
      
      // Position in orbital plane
      const x_orbital = radius * Math.cos(UTILS.degToRad(trueAnomaly));
      const y_orbital = radius * Math.sin(UTILS.degToRad(trueAnomaly));
      
      // Transform to Earth-centered coordinates (simplified)
      const longitude = (satellite.longitude + meanAnomaly) % 360;
      const latitude = inclination * Math.sin(UTILS.degToRad(trueAnomaly)) * 0.1; // Simplified
      const altitude = radius - CONFIG.EARTH_RADIUS_KM;
      
      return {
        latitude: UTILS.clamp(latitude, -90, 90),
        longitude: longitude > 180 ? longitude - 360 : longitude,
        altitude: Math.max(altitude, 160) // Minimum LEO altitude
      };
    });
  }

  // Fast spherical to cartesian conversion with caching
  sphericalToCartesian(lat, lon, alt) {
    const key = `cart_${lat.toFixed(3)}_${lon.toFixed(3)}_${alt.toFixed(1)}`;
    
    return this.getCachedOrCalculate(key, () => {
      return UTILS.sphericalToCartesian(lat, lon, alt);
    });
  }

  // Calculate orbital velocity
  calculateOrbitalVelocity(altitude) {
    const cacheKey = `vel_${altitude.toFixed(1)}`;
    
    return this.getCachedOrCalculate(cacheKey, () => {
      const radius = CONFIG.EARTH_RADIUS_KM + altitude;
      return UTILS.getOrbitalVelocity(radius);
    });
  }

  // Calculate 3D distance between two objects
  calculate3DDistance(pos1, pos2) {
    const key = `dist_${pos1.latitude.toFixed(3)}_${pos1.longitude.toFixed(3)}_${pos1.altitude.toFixed(1)}_${pos2.latitude.toFixed(3)}_${pos2.longitude.toFixed(3)}_${pos2.altitude.toFixed(1)}`;
    
    return this.getCachedOrCalculate(key, () => {
      const cart1 = this.sphericalToCartesian(pos1.latitude, pos1.longitude, pos1.altitude);
      const cart2 = this.sphericalToCartesian(pos2.latitude, pos2.longitude, pos2.altitude);
      
      return UTILS.calculateDistance3D(cart1.x, cart1.y, cart1.z, cart2.x, cart2.y, cart2.z);
    });
  }

  // Optimized proximity filtering for debris
  filterDebrisByProximity(satellitePos, debrisList, maxDistanceKm = CONFIG.DEFAULT_PROXIMITY_KM) {
    const results = [];
    const satCartesian = this.sphericalToCartesian(
      satellitePos.latitude,
      satellitePos.longitude,
      satellitePos.altitude
    );

    // Use spatial indexing for large debris lists
    if (debrisList.length > 100) {
      return this.spatialProximityFilter(satellitePos, debrisList, maxDistanceKm);
    }

    // Direct calculation for smaller lists
    for (const debris of debrisList) {
      const distance = this.calculate3DDistance(satellitePos, debris);
      
      if (distance <= maxDistanceKm) {
        const relativeVelocity = Math.abs(
          this.calculateOrbitalVelocity(satellitePos.altitude) - 
          this.calculateOrbitalVelocity(debris.altitude)
        );

        const riskFactor = this.calculateRiskFactor(distance, relativeVelocity, maxDistanceKm);
        
        results.push({
          ...debris,
          distance_from_satellite_km: Math.round(distance * 100) / 100,
          relative_velocity_kms: Math.round(relativeVelocity * 1000) / 1000,
          proximity_risk_factor: Math.round(riskFactor * 10000) / 10000
        });
      }
    }

    return results.sort((a, b) => b.proximity_risk_factor - a.proximity_risk_factor);
  }

  // Spatial indexing for large debris lists
  spatialProximityFilter(satellitePos, debrisList, maxDistanceKm) {
    // Simple grid-based spatial indexing
    const gridSize = maxDistanceKm / 2;
    const grid = new Map();

    // Grid the debris
    debrisList.forEach(debris => {
      const gridX = Math.floor(debris.longitude / gridSize);
      const gridY = Math.floor(debris.latitude / gridSize);
      const gridZ = Math.floor(debris.altitude / gridSize);
      const gridKey = `${gridX}_${gridY}_${gridZ}`;

      if (!grid.has(gridKey)) {
        grid.set(gridKey, []);
      }
      grid.get(gridKey).push(debris);
    });

    // Check only relevant grid cells
    const satGridX = Math.floor(satellitePos.longitude / gridSize);
    const satGridY = Math.floor(satellitePos.latitude / gridSize);
    const satGridZ = Math.floor(satellitePos.altitude / gridSize);

    const results = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const gridKey = `${satGridX + dx}_${satGridY + dy}_${satGridZ + dz}`;
          const gridDebris = grid.get(gridKey) || [];
          
          for (const debris of gridDebris) {
            const distance = this.calculate3DDistance(satellitePos, debris);
            
            if (distance <= maxDistanceKm) {
              const relativeVelocity = Math.abs(
                this.calculateOrbitalVelocity(satellitePos.altitude) - 
                this.calculateOrbitalVelocity(debris.altitude)
              );

              const riskFactor = this.calculateRiskFactor(distance, relativeVelocity, maxDistanceKm);
              
              results.push({
                ...debris,
                distance_from_satellite_km: Math.round(distance * 100) / 100,
                relative_velocity_kms: Math.round(relativeVelocity * 1000) / 1000,
                proximity_risk_factor: Math.round(riskFactor * 10000) / 10000
              });
            }
          }
        }
      }
    }

    return results.sort((a, b) => b.proximity_risk_factor - a.proximity_risk_factor);
  }

  // Calculate risk factor from distance and velocity
  calculateRiskFactor(distance, relativeVelocity, maxDistance) {
    const distanceFactor = Math.max(0, (maxDistance - distance) / maxDistance);
    const velocityFactor = Math.min(1, relativeVelocity / CONFIG.MAX_RELATIVE_VELOCITY);
    
    return (distanceFactor * CONFIG.RISK_DISTANCE_WEIGHT) + (velocityFactor * CONFIG.RISK_VELOCITY_WEIGHT);
  }

  // Generate optimized Cesium position property from backend samples
  generateCesiumPositionProperty(propagationData, timeSpan = 3600) {
    console.log('generateCesiumPositionProperty called with:', propagationData);
    
    // Validate propagation data
    if (!propagationData || !propagationData.samples || !Array.isArray(propagationData.samples)) {
      console.error('Invalid propagation data - no samples array!', propagationData);
      throw new Error('Propagation data must contain a samples array');
    }

    const samples = propagationData.samples;
    console.log(`Using ${samples.length} propagation samples from backend`);
    
    if (samples.length === 0) {
      throw new Error('No samples in propagation data');
    }

    // Log first sample to see structure
    console.log('First sample structure:', samples[0]);

    const property = new Cesium.SampledPositionProperty();
    
    // Parse start time from first sample's timestamp
    let startTime;
    try {
      if (samples[0].t) {
        startTime = Cesium.JulianDate.fromIso8601(samples[0].t);
      } else {
        startTime = Cesium.JulianDate.now();
      }
    } catch (e) {
      console.warn('Could not parse timestamp, using current time:', e);
      startTime = Cesium.JulianDate.now();
    }
    
    console.log('Start time:', Cesium.JulianDate.toIso8601(startTime));
    
    // Add each sample to the position property
    let validSamples = 0;
    samples.forEach((sample, index) => {
      try {
        // Parse time for this sample
        let sampleTime;
        if (sample.t) {
          sampleTime = Cesium.JulianDate.fromIso8601(sample.t);
        } else {
          // Fallback: use index-based time offset (60 seconds per sample)
          sampleTime = Cesium.JulianDate.addSeconds(startTime, index * 60, new Cesium.JulianDate());
        }
        
        // Get position - backend returns lon_deg, lat_deg, alt_km
        const lon = sample.lon_deg;
        const lat = sample.lat_deg;
        const alt_km = sample.alt_km;
        
        // Validate values
        if (typeof lon !== 'number' || typeof lat !== 'number' || typeof alt_km !== 'number') {
          console.warn(`Sample ${index} has invalid values:`, { lon, lat, alt_km });
          return; // Skip this sample
        }
        
        if (!isFinite(lon) || !isFinite(lat) || !isFinite(alt_km)) {
          console.warn(`Sample ${index} has non-finite values:`, { lon, lat, alt_km });
          return; // Skip this sample
        }
        
        // Convert to Cartesian3 (altitude from km to meters)
        const cartesian = Cesium.Cartesian3.fromDegrees(lon, lat, alt_km * 1000);
        
        // Add sample to property
        property.addSample(sampleTime, cartesian);
        validSamples++;
        
      } catch (error) {
        console.error(`Error processing sample ${index}:`, error, sample);
      }
    });
    
    console.log(`Position property created with ${validSamples} valid samples out of ${samples.length} total`);
    
    if (validSamples === 0) {
      throw new Error('No valid samples could be processed');
    }
    
    return property;
  }

  // Batch calculation for multiple satellites
  batchCalculatePositions(satellites, time) {
    const results = [];
    
    // Use Web Workers for heavy calculations if available
    if (window.Worker && satellites.length > 50) {
      return this.calculatePositionsWithWorker(satellites, time);
    }

    for (const satellite of satellites) {
      results.push({
        satellite: satellite,
        position: this.calculatePositionAtTime(satellite, time)
      });
    }

    return results;
  }

  // Calculate orbital period
  calculateOrbitalPeriod(meanMotion) {
    return this.getCachedOrCalculate(`period_${meanMotion}`, () => {
      return 24 * 60 / meanMotion; // minutes
    });
  }

  // Check if satellite is in LEO
  isLEO(altitude) {
    return altitude >= CONFIG.LEO_ALTITUDE_MIN && altitude <= CONFIG.LEO_ALTITUDE_MAX;
  }

  // Calculate ground track
  calculateGroundTrack(satellite, timeSpan = 3600, steps = 100) {
    const cacheKey = `track_${satellite.norad_id}_${timeSpan}_${steps}`;
    
    return this.getCachedOrCalculate(cacheKey, () => {
      const points = [];
      const timeStep = timeSpan / steps;
      const startTime = Date.now();

      for (let i = 0; i <= steps; i++) {
        const time = startTime + (i * timeStep * 1000);
        const pos = this.calculatePositionAtTime(satellite, time);
        points.push([pos.longitude, pos.latitude]);
      }

      return points;
    });
  }

  // Clear all caches
  clearCache() {
    this.cache.clear();
    this.positionCache.clear();
  }

  // Get cache statistics
  getCacheStats() {
    return {
      cacheSize: this.cache.size,
      positionCacheSize: this.positionCache.size,
      totalEntries: this.cache.size + this.positionCache.size
    };
  }
}

// Create global orbital calculator instance
const OrbitalCalc = new OrbitalCalculator();

// Make it globally available immediately
window.OrbitalCalc = OrbitalCalc;

console.log('✓ Orbital calculator created and available globally');

// Clean cache periodically
setInterval(() => {
  OrbitalCalc.cleanCache();
}, 60000); // Every minute

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = OrbitalCalculator;
}