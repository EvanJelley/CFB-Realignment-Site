import * as turf from '@turf/turf';
import { point } from 'leaflet';
import * as MathUtils from 'math-utils';


function radians(degrees) {
    return degrees * (Math.PI / 180);
}

function degrees(radians) {
    return radians * (180 / Math.PI);
}

function pointToPointCalc(lat1, lon1, lat2, lon2, type) {
    /**
     * Calculate the distance between two points on the earth's surface
     * @param {number} lat1, lat2, lon1, lon2 - latitude and longitude of the two points (should be in radians)
     * @param {string} type - radians or degrees
     * @return {number} distance between the two points (in miles)
     */
    if (type === 'degrees') {
        lat1 = lat1 * Math.PI / 180;
        lon1 = lon1 * Math.PI / 180;
        lat2 = lat2 * Math.PI / 180;
        lon2 = lon2 * Math.PI / 180;
    }
    const R = 3958.8; // radius of the earth in miles
    if (Math.abs(lat1 - lat2) < .00000001 && Math.abs(lon1 - lon2) < .00000001) {
        return 0;
    }
    const distance = Math.acos(Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(lon1 - lon2)) * R;
    return distance;
}

function distanceCalc(main, points, type) {
    /**
     * Calculate the distance between a point and a set of points
     * @param {Array} main - an array with the latitude and longitude of the main point
     * @param {Array} points - an array of arrays with the latitude and longitude of the set of points
     * @return {number} the total distance between the main point and the set of points
     */
    let distance = 0;
    for (let point of points) {
        distance += pointToPointCalc(main[0], main[1], point[0], point[1], type);
    }
    return distance;
}

function averageDistanceCalc(main, points, type) {
    /**
     * Calculate the average distance between a point and a set of points
     * @param {Array} main - an array with the latitude and longitude of the main point
     * @param {Array} points - an array of arrays with the latitude and longitude of the set of points
     * @return {number} the average distance between the main point and the set of points
     */
    return distanceCalc(main, points, type) / points.length;
}

function generate_test_points(lat, lon, distance) {
    const R = 6371.0; // Earth's radius in kilometers
    const bearings = [0, 45, 90, 135, 180, 225, 270, 315]; // Bearings in degrees

    const test_points = [];
    for (const bearing of bearings) {
        // Convert bearing to radians
        const brng_rad = bearing * Math.PI / 180;

        // Calculate the new latitude
        const new_lat = Math.asin(Math.sin(lat) * Math.cos(distance / R) +
            Math.cos(lat) * Math.sin(distance / R) * Math.cos(brng_rad));

        // Calculate the new longitude
        const new_lon = lon + Math.atan2(Math.sin(brng_rad) * Math.sin(distance / R) * Math.cos(lat),
            Math.cos(distance / R) - Math.sin(lat) * Math.sin(new_lat));

        // Append new point to the list
        test_points.push([new_lat, new_lon]);
    }

    return test_points;
}

function calculateGeoCenter(points) {
    /**
     * Calculate the geographic center of a set of points
     * @param {Array} points - an array of arrays with the latitude and longitude of the set of points
     * @return {Array} the latitude and longitude of the geographic center
     */

    // Calculate initial center
    let x = [];
    let y = [];
    let z = [];
    let radianPoints = [];
    for (let point of points) {
        let latitude = radians(point[0]);
        let longitude = radians(point[1]);
        radianPoints.push([latitude, longitude]);
        x.push(Math.cos(latitude) * Math.cos(longitude));
        y.push(Math.cos(latitude) * Math.sin(longitude));
        z.push(Math.sin(latitude));
    }
    x = x.reduce((a, b) => a + b, 0) / x.length;
    y = y.reduce((a, b) => a + b, 0) / y.length;
    z = z.reduce((a, b) => a + b, 0) / z.length;
    let centralLongitude = Math.atan2(y, x);
    let centralSquareRoot = Math.sqrt(x * x + y * y);
    let centralLatitude = Math.atan2(z, centralSquareRoot);

    // Iterate to find better center
    let currentPoint = [centralLatitude, centralLongitude];
    let totDistance = distanceCalc(currentPoint, radianPoints, 'radians');

    // Test points for a better center
    for (let point of radianPoints) {
        let newDistance = distanceCalc(point, radianPoints, 'radians');
        if (newDistance < totDistance) {
            currentPoint = point;
            totDistance = newDistance;
        }
    }

    let testDistance = 10018 / 6371.0;
    while (testDistance > 0.000000002) {
        let testPoints = generate_test_points(currentPoint[0], currentPoint[1], testDistance);
        let newPointFlag = false;
        for (let point of testPoints) {
            let testPointDistance = distanceCalc(point, radianPoints, 'radians');
            if (testPointDistance < totDistance) {
                currentPoint = point;
                totDistance = testPointDistance;
                newPointFlag = true;
            }
        }
        if (!newPointFlag) {
            testDistance = testDistance / 2;
        }
    }

    currentPoint = [degrees(currentPoint[0]), degrees(currentPoint[1])];
    return currentPoint;
}

function avgDistanceFromCenter(points) {
    const center = calculateGeoCenter(points);
    const distances = points.map(point => pointToPointCalc(center[0], center[1], point[0], point[1], 'degrees'));
    return distances.reduce((a, b) => a + b, 0) / distances.length;
}

function averagedistanceCalcMultiPoints(points, type) {
    /**
     * Calculates the average distance between each other for a set of points
     * @param {*} points - and array with the latitude and longitude of the set of points
     * @returns the average distance of the set of points
     */
    let averageDistances = [];
    for (let main of points) {
        const otherPoints = points.filter(p => p !== main);
        averageDistances.push(averageDistanceCalc(main, otherPoints, type));
    }
    return averageDistances.reduce((a, b) => a + b, 0) / averageDistances.length;
}

function calculateConvexHull(points) {
    const pointsFeatureCollection = turf.featureCollection(points.map(point => turf.point(point)));
    const hull = turf.convex(pointsFeatureCollection);
    return hull ? hull.geometry.coordinates[0] : [];
}

function findCapital(geoCenter, cityObjects) {

    let closestDist = null;
    let closestCity = null;
    for (let i = 0; i < cityObjects.length; i++) {
        let city = cityObjects[i];
        let distance = pointToPointCalc(city.Latitude, city.Longitude, geoCenter[0], geoCenter[1], 'degrees');
        console.log(distance, city.City, city.State);
        if (closestCity === null || distance < closestDist) {
            closestCity = city;
            closestDist = distance;
        }
    };
    console.log(closestCity);
    return {city: closestCity.City, state: closestCity.State, latitude: closestCity.Latitude, longitude: closestCity.Longitude};
}

export { pointToPointCalc, distanceCalc, averageDistanceCalc, calculateConvexHull, averagedistanceCalcMultiPoints, avgDistanceFromCenter, calculateGeoCenter, findCapital };