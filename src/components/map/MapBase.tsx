import { Map, View } from 'ol';
import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';
import { fromLonLat } from 'ol/proj';
import 'ol/ol.css';

interface MapBaseProps {
  container: HTMLElement;
}

const MapBase = ({ container }: MapBaseProps) => {
  const map = new Map({
    target: container,
    layers: [
      new TileLayer({
        // CARTO basemaps now require an API key; OSM tiles are keyless.
        // The 'dark-tiles' class applies a CSS filter for the dark look.
        className: 'dark-tiles',
        source: new XYZ({
          url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          attributions: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }),
      }),
    ],
    view: new View({
      center: fromLonLat([0, 0]),
      zoom: 1.8,
      minZoom: 1.8,
      maxZoom: 1.8,
      enableRotation: false,
    }),
    controls: [],
    interactions: [],
  });

  return map;
};

export default MapBase;