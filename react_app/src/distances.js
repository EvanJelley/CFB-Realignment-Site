import * as turf from '@turf/turf';

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
        console.log(distance);
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

function calculateConvexHull(points) {
    const pointsFeatureCollection = turf.featureCollection(points.map(point => turf.point(point)));
    const hull = turf.convex(pointsFeatureCollection);
    return hull ? hull.geometry.coordinates[0] : [];
  }

export { pointToPointCalc, distanceCalc, averageDistanceCalc, calculateConvexHull };