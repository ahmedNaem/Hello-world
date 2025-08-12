document.addEventListener('DOMContentLoaded', () => {
    // --- MAP INITIALIZATION ---
    const map = L.map('map').setView([31.5, 34.4], 10); // Centered on the Gaza Strip

    // --- TILE LAYER ---
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // --- SIMULATION CONSTANTS ---
    const SIMULATION_CONSTANTS = {
        SEA_CURRENT: { x: -0.0001, y: 0.00005 }, // Southwest-to-northeast drift
        WIND: { x: 0.00008, y: 0.00002 },        // General wind direction
        TIME_STEPS: 100,                         // Number of steps in the simulation
    };

    // --- GAZA COASTLINE GEOJSON ---
    // A simplified polygon representing the Gaza Strip coastline.
    // In a real-world scenario, this would be more detailed.
    const gazaCoastlineGeoJSON = {
        "type": "Polygon",
        "coordinates": [[
            [34.23, 31.25], // Rafah area
            [34.28, 31.35],
            [34.35, 31.42],
            [34.45, 31.5],  // Gaza City area
            [34.5, 31.55],
            [34.55, 31.6],  // Northern area
            [34.53, 31.6],
            [34.48, 31.55],
            [34.43, 31.5],
            [34.33, 31.42],
            [34.26, 31.35],
            [34.21, 31.25],
            [34.23, 31.25]  // Closing the polygon
        ]]
    };

    // Style for the coastline
    const coastStyle = {
        "color": "#007bff",
        "weight": 5,
        "opacity": 0.65
    };

    // Add the GeoJSON layer to the map
    const gazaLayer = L.geoJSON(gazaCoastlineGeoJSON, { style: coastStyle }).addTo(map);

    // Fit map to the bounds of the coastline
    map.fitBounds(gazaLayer.getBounds());

    // --- COLLISION DETECTION (Point in Polygon) ---
    // Ray-casting algorithm to determine if a point is inside a polygon.
    function isPointInPolygon(point, polygon) {
        let [x, y] = point;
        let polyCoords = polygon.coordinates[0];
        let inside = false;
        for (let i = 0, j = polyCoords.length - 1; i < polyCoords.length; j = i++) {
            let [xi, yi] = polyCoords[i];
            let [xj, yj] = polyCoords[j];
            let intersect = ((yi > y) !== (yj > y))
                && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    // --- SILENT SIMULATION FOR OPTIMAL ZONE CALCULATION ---
    function calculateFinalPosition(startLatLng) {
        let currentPos = { lat: startLatLng.lat, lng: startLatLng.lng };
        const totalDrift = {
            lat: SIMULATION_CONSTANTS.SEA_CURRENT.y + SIMULATION_CONSTANTS.WIND.y,
            lng: SIMULATION_CONSTANTS.SEA_CURRENT.x + SIMULATION_CONSTANTS.WIND.x
        };

        for (let i = 0; i < SIMULATION_CONSTANTS.TIME_STEPS; i++) {
            currentPos.lat += totalDrift.lat;
            currentPos.lng += totalDrift.lng;
        }
        return L.latLng(currentPos.lat, currentPos.lng);
    }

    // --- FEATURE: OPTIMAL DROP ZONE SUGGESTION ---
    function showOptimalDropZones() {
        const bounds = gazaLayer.getBounds().pad(0.5); // Extend bounds offshore
        const westBound = bounds.getWest();
        const southBound = bounds.getSouth();
        const eastBound = gazaLayer.getBounds().getWest(); // Stop at the coastline
        const northBound = bounds.getNorth();

        const gridDensity = 20; // Increase for more points
        const latStep = (northBound - southBound) / gridDensity;
        const lngStep = (eastBound - westBound) / gridDensity;

        const optimalZones = [];
        let checkedPoints = 0;

        // Display a loading message
        const statusPanel = document.getElementById('status-panel');
        statusPanel.textContent = 'Calculating optimal drop zones...';

        // Use a timeout to avoid blocking the main thread
        setTimeout(() => {
            for (let lat = southBound; lat < northBound; lat += latStep) {
                for (let lng = westBound; lng < eastBound; lng += lngStep) {
                    const startPoint = L.latLng(lat, lng);
                    const finalPoint = calculateFinalPosition(startPoint);
                    checkedPoints++;

                    if (isPointInPolygon([finalPoint.lng, finalPoint.lat], gazaCoastlineGeoJSON)) {
                        optimalZones.push(startPoint);
                    }
                }
            }

            // Draw the optimal zones on the map
            optimalZones.forEach(zone => {
                L.circle(zone, {
                    radius: 200, // In meters
                    color: 'green',
                    fillColor: '#0f0',
                    fillOpacity: 0.2,
                    weight: 1
                }).addTo(map);
            });

            // Update status panel
            statusPanel.textContent = 'Optimal drop zones calculated. Click on the sea to simulate an aid drop.';
            console.log(`Checked ${checkedPoints} potential drop points and found ${optimalZones.length} successful zones.`);
        }, 50); // 50ms timeout to allow UI to render
    }

    // Initial call to find and display optimal zones
    showOptimalDropZones();

    // --- MAIN SIMULATION ON CLICK ---
    let simulationCount = 0;
    function runSimulation(startLatLng) {
        simulationCount++;
        const statusPanel = document.getElementById('status-panel');
        statusPanel.innerHTML = `Simulating drop #${simulationCount}... <br><small>Location: ${startLatLng.lat.toFixed(4)}, ${startLatLng.lng.toFixed(4)}</small>`;

        // Create a parachute icon
        const aidIcon = L.divIcon({
            html: '📦',
            className: 'leaflet-marker-icon',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });

        const marker = L.marker(startLatLng, { icon: aidIcon }).addTo(map);
        const trajectory = L.polyline([startLatLng], { className: 'path-default', weight: 3 }).addTo(map);

        let currentPos = { lat: startLatLng.lat, lng: startLatLng.lng };
        let step = 0;
        const totalDrift = {
            lat: SIMULATION_CONSTANTS.SEA_CURRENT.y + SIMULATION_CONSTANTS.WIND.y,
            lng: SIMULATION_CONSTANTS.SEA_CURRENT.x + SIMULATION_CONSTANTS.WIND.x
        };

        const animationInterval = setInterval(() => {
            currentPos.lat += totalDrift.lat;
            currentPos.lng += totalDrift.lng;

            const newLatLng = L.latLng(currentPos.lat, currentPos.lng);
            marker.setLatLng(newLatLng);
            trajectory.addLatLng(newLatLng);

            step++;
            if (step >= SIMULATION_CONSTANTS.TIME_STEPS) {
                clearInterval(animationInterval);

                // --- FINAL CHECK AND VISUAL FEEDBACK ---
                const finalLatLng = marker.getLatLng();
                const isSuccess = isPointInPolygon([finalLatLng.lng, finalLatLng.lat], gazaCoastlineGeoJSON);

                if (isSuccess) {
                    trajectory.setStyle({ className: 'path-success', color: 'green', dashArray: null });
                    statusPanel.innerHTML = `<strong>SUCCESS:</strong><br>Aid from drop #${simulationCount} is predicted to reach the shore.`;
                } else {
                    trajectory.setStyle({ className: 'path-failure', color: 'red', dashArray: null });
                    statusPanel.innerHTML = `<strong>FAILURE:</strong><br>Aid from drop #${simulationCount} is predicted to be lost at sea.`;
                }
            }
        }, 50); // 50ms per step for animation
    }

    // --- MAP CLICK EVENT LISTENER ---
    map.on('click', (e) => {
        // Prevent clicks on the coastline polygon itself from starting a simulation
        if (isPointInPolygon([e.latlng.lng, e.latlng.lat], gazaCoastlineGeoJSON)) {
            console.log("Clicked on land, simulation aborted.");
            return;
        }
        runSimulation(e.latlng);
    });
});
