import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import { 
  Map as MapIcon, Layers, Radio, Globe, UploadCloud, Info, CheckCircle2, Clock, 
  XCircle, MapPin, Search, FileText, ChevronRight, Eye, Trash2, HelpCircle, X
} from 'lucide-react';
import type { LandRecord } from '../types';

interface InteractiveMapProps {
  records: LandRecord[];
  role?: string | null;
  activeProjectName?: string;
  activeProjectId?: string;
}

interface LoadedGeoJSON {
  id: string;
  name: string;
  type: 'bidang' | 'jalur' | 'tower';
  data: any;
  visible: boolean;
  fieldMapping?: {
    desa?: string;
    span?: string;
    nobid?: string;
    nama?: string;
    tower?: string;
    jalurName?: string;
  };
  isDefault?: boolean;
}

const findPropertyCaseInsensitive = (properties: any, keysToTry: string[]): string => {
  if (!properties) return '';
  const lowerKeys = keysToTry.map(k => k.toLowerCase());
  
  // First, try exact matches (case-sensitive) for performance/precision
  for (const key of keysToTry) {
    if (properties[key] !== undefined && properties[key] !== null) {
      return String(properties[key]).trim();
    }
  }
  
  // Next, try case-insensitive matches
  const propKeys = Object.keys(properties);
  for (const propKey of propKeys) {
    const lowerPropKey = propKey.toLowerCase();
    if (lowerKeys.includes(lowerPropKey)) {
      return String(properties[propKey]).trim();
    }
  }
  
  return '';
};

const getGeoJSONKeys = (geojson: any): string[] => {
  if (!geojson || !geojson.features || !geojson.features.length) return [];
  const keysSet = new Set<string>();
  const sampleCount = Math.min(geojson.features.length, 15);
  for (let i = 0; i < sampleCount; i++) {
    const props = geojson.features[i].properties;
    if (props) {
      Object.keys(props).forEach(k => keysSet.add(k));
    }
  }
  return Array.from(keysSet).sort();
};

const getDesaOfBidang = (properties: any, layer: LoadedGeoJSON) => {
  if (layer.fieldMapping?.desa) {
    return String(properties[layer.fieldMapping.desa] || '').trim();
  }
  return findPropertyCaseInsensitive(properties, [
    'desa', 'village', 'kelurahan', 'distrik', 'kecamatan', 'kabupaten'
  ]);
};

const getSpanOfBidang = (properties: any, layer: LoadedGeoJSON) => {
  if (layer.fieldMapping?.span) {
    return String(properties[layer.fieldMapping.span] || '').trim();
  }
  return findPropertyCaseInsensitive(properties, [
    'span', 'section', 'jalur', 'row', 'koridor', 'corridor'
  ]);
};

const getNobidOfBidang = (properties: any, layer: LoadedGeoJSON) => {
  if (layer.fieldMapping?.nobid) {
    return String(properties[layer.fieldMapping.nobid] || '').trim();
  }
  return findPropertyCaseInsensitive(properties, [
    'nobidis', 'nobiddis', 'nobid', 'no_bidang', 'no_bid', 'nomor', 'nomer', 'id', 'fid', 'objectid'
  ]);
};

const getNamaOfBidang = (properties: any, layer: LoadedGeoJSON) => {
  if (layer.fieldMapping?.nama) {
    return String(properties[layer.fieldMapping.nama] || '').trim();
  }
  return findPropertyCaseInsensitive(properties, [
    'namafinal', 'nama_final', 'nama', 'nama_pemilik', 'pemilik', 'owner', 'name'
  ]);
};

const getTowerNum = (properties: any, layer: LoadedGeoJSON) => {
  if (layer.fieldMapping?.tower) {
    return String(properties[layer.fieldMapping.tower] || '').trim();
  }
  return findPropertyCaseInsensitive(properties, [
    'towernumb', 'tower', 'label', 'name', 'id_tower', 'nomor_tower'
  ]);
};

const getJalurName = (properties: any, layer: LoadedGeoJSON) => {
  if (layer.fieldMapping?.jalurName) {
    return String(properties[layer.fieldMapping.jalurName] || '').trim();
  }
  return findPropertyCaseInsensitive(properties, [
    'nama', 'name', 'jalur', 'corridor', 'row'
  ]);
};

const normalizeString = (val: string): string => {
  return String(val || '').trim().toLowerCase();
};

const normalizeNobid = (val: string): string => {
  const s = normalizeString(val);
  return s.replace(/^0+/, '') || '0';
};

const normalizeSpan = (val: string): string => {
  const s = normalizeString(val);
  return s
    .replace(/[\s\-_.]/g, '')
    .replace(/0+(\d+)/g, '$1');
};

const isRecordMatched = (
  featNobid: string,
  featDesa: string,
  featSpan: string,
  recordNobid: string,
  recordDesa: string,
  recordSpan: string
): boolean => {
  const nFeatNobid = normalizeNobid(featNobid);
  const nRecordNobid = normalizeNobid(recordNobid);
  if (!nFeatNobid || !nRecordNobid || nFeatNobid !== nRecordNobid) {
    return false;
  }

  const nFeatDesa = normalizeString(featDesa);
  const nRecordDesa = normalizeString(recordDesa);
  if (nFeatDesa && nRecordDesa) {
    if (!nFeatDesa.includes(nRecordDesa) && !nRecordDesa.includes(nFeatDesa)) {
      return false;
    }
  }

  const nFeatSpan = normalizeSpan(featSpan);
  const nRecordSpan = normalizeSpan(recordSpan);
  if (nFeatSpan && nRecordSpan) {
    if (!nFeatSpan.includes(nRecordSpan) && !nRecordSpan.includes(nFeatSpan)) {
      return false;
    }
  }

  return true;
};

const saveCustomGeoJSONToLocalStorage = (name: string, type: 'bidang' | 'jalur' | 'tower', data: any) => {
  try {
    const saved = localStorage.getItem('gis_custom_geojson_layers');
    const list = saved ? JSON.parse(saved) : [];
    if (!list.some((item: any) => item.name === name)) {
      list.push({ name, type, data });
      localStorage.setItem('gis_custom_geojson_layers', JSON.stringify(list));
    }
  } catch (err) {
    console.warn('Gagal menyimpan GeoJSON ke localStorage:', err);
  }
};

const removeCustomGeoJSONFromLocalStorage = (name: string) => {
  try {
    const saved = localStorage.getItem('gis_custom_geojson_layers');
    if (saved) {
      const list = JSON.parse(saved);
      const filtered = list.filter((item: any) => item.name !== name);
      localStorage.setItem('gis_custom_geojson_layers', JSON.stringify(filtered));
    }
  } catch (err) {
    // ignore
  }
};

export default function InteractiveMap({ records, role, activeProjectName, activeProjectId }: InteractiveMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const geojsonLayersRef = useRef<{ [key: string]: L.GeoJSON }>({});
  
  // States
  const [basemap, setBasemap] = useState<'osm' | 'satelit' | 'google'>('google');
  const [loadedGeoJSONs, setLoadedGeoJSONs] = useState<LoadedGeoJSON[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<LandRecord | null>(null);
  const [selectedFeatureProps, setSelectedFeatureProps] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDesa, setSelectedDesa] = useState<string>('ALL');
  const [configuringLayer, setConfiguringLayer] = useState<LoadedGeoJSON | null>(null);
  const [tempMapping, setTempMapping] = useState<any>({});
  const [activeSubTab, setActiveSubTab] = useState<'peta' | 'geojson'>('peta');
  const fittedLayersRef = useRef<string[]>([]);

  // Unique list of Desas for filtering
  const desas = useMemo(() => {
    const list = new Set<string>();
    records.forEach(r => { if (r.DESA) list.add(r.DESA); });
    return ['ALL', ...Array.from(list).sort()];
  }, [records]);

  // Filtered records for the list below/side
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      const matchDesa = selectedDesa === 'ALL' || r.DESA === selectedDesa;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch = !q || 
        (r.NAMA || '').toLowerCase().includes(q) ||
        (r.DESA || '').toLowerCase().includes(q) ||
        (r.SPAN || '').toLowerCase().includes(q) ||
        (r.NOBID || '').toLowerCase().includes(q) ||
        (r.CODE || '').toLowerCase().includes(q);
      return matchDesa && matchSearch;
    });
  }, [records, selectedDesa, searchQuery]);

  // Handle invalidating map size when tab switches to 'peta'
  useEffect(() => {
    if (activeSubTab === 'peta' && mapRef.current) {
      const timer = setTimeout(() => {
        mapRef.current?.invalidateSize();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [activeSubTab]);

  // Leaflet Tile Layers
  const tileLayers = useRef<{ osm: L.TileLayer; satelit: L.TileLayer; google: L.TileLayer } | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Center map around a default Central Java coordinate (Jelok area / Salatiga / Boyolali)
    const defaultCenter: L.LatLngExpression = [-7.3, 110.5]; 
    const map = L.map(mapContainerRef.current, {
      center: defaultCenter,
      zoom: 12,
      zoomControl: false,
      maxZoom: 22
    });

    L.control.zoom({ position: 'topright' }).addTo(map);

    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{y}/{x}.png', {
      maxZoom: 22,
      maxNativeZoom: 19,
      attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors'
    });

    const satelit = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 22,
      maxNativeZoom: 19,
      attribution: 'Tiles &copy; Esri'
    });

    const google = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      maxZoom: 22,
      maxNativeZoom: 21,
      attribution: '&copy; Google Maps'
    });

    // Add google layer by default
    google.addTo(map);
    tileLayers.current = { osm, satelit, google };
    mapRef.current = map;

    // Restore custom layers from browser localStorage once on mount
    try {
      const saved = localStorage.getItem('gis_custom_geojson_layers');
      if (saved) {
        const list = JSON.parse(saved);
        list.forEach((item: any) => {
          handleAddGeoJSON(item.data, item.name, item.type, false); // false so they are treated as custom layers (not deleted on project switch)
        });
      }
    } catch (err) {
      // ignore
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Load project-specific GeoJSON files dynamically when active project changes
  useEffect(() => {
    if (!mapRef.current) return;

    const loadProjectGeoJSONs = async () => {
      // 1. Remove previous default/project-specific layers
      setLoadedGeoJSONs(prev => {
        const customOnly = prev.filter(p => !p.isDefault);
        const defaults = prev.filter(p => p.isDefault);
        
        // Remove default layers from map
        defaults.forEach(d => {
          if (mapRef.current && geojsonLayersRef.current[d.id]) {
            mapRef.current.removeLayer(geojsonLayersRef.current[d.id]);
            delete geojsonLayersRef.current[d.id];
          }
          fittedLayersRef.current = fittedLayersRef.current.filter(fid => fid !== d.id);
        });
        
        return customOnly;
      });

      // 2. Prepare paths to test for the active project
      const projName = activeProjectName || '';
      const normalizedProj = projName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

      // Helper to fetch file from list of paths sequentially
      const tryFetchFile = async (paths: string[]) => {
        for (const p of paths) {
          try {
            const res = await fetch(p);
            if (res.ok) {
              const data = await res.json();
              return { data, path: p };
            }
          } catch (e) {
            // Try next path
          }
        }
        return null;
      };

      // Define candidatos for Tapak Tower
      const towerCandidates = projName ? [
        `/geojson/${projName}_TAPAK_TOWER.geojson`,
        `/geojson/${projName}_tapak_tower.geojson`,
        `/geojson/${projName}_TOWER.geojson`,
        `/geojson/${projName}_tower.geojson`,
        `/geojson/${normalizedProj}_tapak_tower.geojson`,
        `/geojson/${normalizedProj}_tower.geojson`,
      ] : [];
      towerCandidates.push('/geojson/tapak_tower.geojson'); // fallback

      // Define candidatos for Jalur Koridor
      const jalurCandidates = projName ? [
        `/geojson/${projName}_JALUR_UTUH.geojson`,
        `/geojson/${projName}_jalur_utuh.geojson`,
        `/geojson/${projName}_JALUR.geojson`,
        `/geojson/${projName}_jalur.geojson`,
        `/geojson/${normalizedProj}_jalur_utuh.geojson`,
        `/geojson/${normalizedProj}_jalur.geojson`,
      ] : [];
      jalurCandidates.push('/geojson/jalur_utuh.geojson'); // fallback

      // Define candidatos for Bidang Tanah
      const bidangCandidates = projName ? [
        `/geojson/${projName}_BIDANG_WARGA.geojson`,
        `/geojson/${projName}_bidang_warga.geojson`,
        `/geojson/${projName}_BIDANG_TANAH.geojson`,
        `/geojson/${projName}_bidang_tanah.geojson`,
        `/geojson/${projName}_BIDANG.geojson`,
        `/geojson/${projName}_bidang.geojson`,
        `/geojson/${normalizedProj}_bidang_warga.geojson`,
        `/geojson/${normalizedProj}_bidang_tanah.geojson`,
        `/geojson/${normalizedProj}_bidang.geojson`,
      ] : [];
      bidangCandidates.push('/geojson/bidang_tanah.geojson'); // fallback

      // Load Tower Layer
      const towerRes = await tryFetchFile(towerCandidates);
      if (towerRes) {
        const isFallback = towerRes.path.endsWith('/geojson/tapak_tower.geojson');
        const displayName = isFallback 
          ? 'Tapak Tower (Default)' 
          : `Tapak Tower (${projName})`;
        handleAddGeoJSON(towerRes.data, displayName, 'tower', true);
      }

      // Load Jalur Layer
      const jalurRes = await tryFetchFile(jalurCandidates);
      if (jalurRes) {
        const isFallback = jalurRes.path.endsWith('/geojson/jalur_utuh.geojson');
        const displayName = isFallback 
          ? 'Jalur Transmisi (Default)' 
          : `Jalur Transmisi (${projName})`;
        handleAddGeoJSON(jalurRes.data, displayName, 'jalur', true);
      }

      // Load Bidang Layer
      const bidangRes = await tryFetchFile(bidangCandidates);
      if (bidangRes) {
        const isFallback = bidangRes.path.endsWith('/geojson/bidang_tanah.geojson');
        const displayName = isFallback 
          ? 'Semua Bidang Tanah (Default)' 
          : `Bidang Tanah (${projName})`;
        handleAddGeoJSON(bidangRes.data, displayName, 'bidang', true);
      }
    };

    loadProjectGeoJSONs();
  }, [activeProjectName, activeProjectId]);

  // Sync Basemap Change
  useEffect(() => {
    if (!mapRef.current || !tileLayers.current) return;
    const { osm, satelit, google } = tileLayers.current;

    // Safely remove all layers to prevent overlays
    mapRef.current.removeLayer(osm);
    mapRef.current.removeLayer(satelit);
    mapRef.current.removeLayer(google);

    if (basemap === 'osm') {
      osm.addTo(mapRef.current);
    } else if (basemap === 'satelit') {
      satelit.addTo(mapRef.current);
    } else {
      google.addTo(mapRef.current);
    }
  }, [basemap]);

  // Custom styling generator for GeoJSON features
  const getFeatureStyle = (type: 'bidang' | 'jalur' | 'tower', isHighlighted: boolean) => {
    if (type === 'jalur') {
      return {
        color: '#f97316', // Orange
        weight: isHighlighted ? 6 : 4,
        opacity: 0.85,
        dashArray: '8, 6',
        fillColor: '#fdba74',
        fillOpacity: 0.15
      };
    }

    // Default 'bidang' styles
    return {
      color: isHighlighted ? '#3b82f6' : '#10b981', // Blue if selected, Emerald if regular
      weight: isHighlighted ? 4 : 2,
      opacity: 0.9,
      fillColor: isHighlighted ? '#93c5fd' : '#34d399',
      fillOpacity: isHighlighted ? 0.45 : 0.25
    };
  };

  // Helper to trigger highlights and updates when map GeoJSON layers are loaded/interacted with
  const handleAddGeoJSON = (data: any, name: string, type: 'bidang' | 'jalur' | 'tower', isDefault: boolean = false) => {
    const id = `${type}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newLayer: LoadedGeoJSON = { id, name, type, data, visible: true, isDefault };
    
    setLoadedGeoJSONs(prev => {
      // Avoid duplicate defaults by checking name
      if (prev.some(p => p.name === name)) return prev;
      return [...prev, newLayer];
    });

    if (!isDefault) {
      saveCustomGeoJSONToLocalStorage(name, type, data);
    }
  };

  // Function to remove a GeoJSON layer from the map and state
  const handleRemoveGeoJSON = (id: string) => {
    const layer = loadedGeoJSONs.find(g => g.id === id);
    if (layer) {
      removeCustomGeoJSONFromLocalStorage(layer.name);
    }
    if (mapRef.current && geojsonLayersRef.current[id]) {
      mapRef.current.removeLayer(geojsonLayersRef.current[id]);
      delete geojsonLayersRef.current[id];
    }
    fittedLayersRef.current = fittedLayersRef.current.filter(fid => fid !== id);
    setLoadedGeoJSONs(prev => prev.filter(g => g.id !== id));
  };

  // Toggle visibility of loaded GeoJSON layers
  const handleToggleVisibility = (id: string) => {
    setLoadedGeoJSONs(prev => prev.map(g => {
      if (g.id !== id) return g;
      const nextVisible = !g.visible;
      if (mapRef.current && geojsonLayersRef.current[id]) {
        if (nextVisible) {
          geojsonLayersRef.current[id].addTo(mapRef.current);
        } else {
          mapRef.current.removeLayer(geojsonLayersRef.current[id]);
        }
      }
      return { ...g, visible: nextVisible };
    }));
  };

  // Render & update Leaflet Layers when loadedGeoJSONs or selectedRecord changes
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    // Clear old GeoJSON layers first
    Object.keys(geojsonLayersRef.current).forEach(key => {
      map.removeLayer(geojsonLayersRef.current[key]);
    });
    geojsonLayersRef.current = {};

    // Re-add visible layers
    loadedGeoJSONs.forEach(layer => {
      if (!layer.visible) return;

      const leafLayer = L.geoJSON(layer.data, {
        // Point layer style (Towers)
        pointToLayer: (feature, latlng) => {
          if (layer.type === 'tower') {
            const label = getTowerNum(feature.properties, layer) || 'T';
            const towerHtml = `
              <div class="flex flex-col items-center">
                <div class="w-7 h-7 rounded-full bg-indigo-600 border-2 border-white text-white font-bold text-[10px] flex items-center justify-center shadow-lg glow-indigo hover:scale-110 transition-transform">
                  🗼
                </div>
                <div class="mt-0.5 px-1 bg-slate-900/90 text-white font-mono text-[9px] font-bold rounded border border-white/20 whitespace-nowrap shadow-md">
                  ${label}
                </div>
              </div>
            `;
            const icon = L.divIcon({
              html: towerHtml,
              className: 'custom-tower-marker',
              iconSize: [40, 40],
              iconAnchor: [20, 20]
            });

            return L.marker(latlng, { icon });
          }
          return L.marker(latlng);
        },

        // Polygons/LineStrings style
        style: (feature) => {
          // Check if this feature matches the currently selected record
          let isHighlighted = false;
          if (selectedRecord && layer.type === 'bidang') {
            const featNobid = getNobidOfBidang(feature.properties, layer);
            const featDesa = getDesaOfBidang(feature.properties, layer);
            const featSpan = getSpanOfBidang(feature.properties, layer);
            
            const recordNobid = selectedRecord.NOBID || '';
            const recordDesa = selectedRecord.DESA || '';
            const recordSpan = selectedRecord.SPAN || '';

            if (isRecordMatched(featNobid, featDesa, featSpan, recordNobid, recordDesa, recordSpan)) {
              isHighlighted = true;
            }
          }
          return getFeatureStyle(layer.type, isHighlighted);
        },

        // Interaction logic
        onEachFeature: (feature, fLayer) => {
          // Tooltips/Popups
          const properties = feature.properties || {};
          let tooltipText = '';

          if (layer.type === 'tower') {
            const name = getTowerNum(properties, layer) || 'Tower';
            tooltipText = `<strong>Tapak Tower: ${name}</strong>`;
            if (properties.KETERANGAN) tooltipText += `<br/><span class="text-xs">${properties.KETERANGAN}</span>`;
            fLayer.bindTooltip(tooltipText, { permanent: false, direction: 'top', className: 'custom-map-tooltip' });
          } else if (layer.type === 'jalur') {
            const lineName = getJalurName(properties, layer) || 'Jalur ROW';
            tooltipText = `<strong>${lineName}</strong>`;
            fLayer.bindTooltip(tooltipText, { className: 'custom-map-tooltip' });
          } else {
            // Bidang/Parcel
            const nobid = getNobidOfBidang(properties, layer) || 'N/A';
            const owner = getNamaOfBidang(properties, layer) || 'N/A';
            const desa = getDesaOfBidang(properties, layer) || 'N/A';
            const span = getSpanOfBidang(properties, layer) || 'N/A';

            tooltipText = `
              <div class="p-1 text-slate-100 font-sans">
                <p class="font-bold text-xs border-b border-white/20 pb-1 mb-1 text-indigo-300">Bidang No. ${nobid}</p>
                <p class="text-[10px]"><span class="text-slate-400">Pemilik:</span> ${owner}</p>
                <p class="text-[10px]"><span class="text-slate-400">Desa:</span> ${desa}</p>
                <p class="text-[10px]"><span class="text-slate-400">Span:</span> ${span}</p>
              </div>
            `;
            fLayer.bindTooltip(tooltipText, { className: 'custom-map-tooltip-dark' });

            // Click Handler
            fLayer.on('click', () => {
              setSelectedFeatureProps(properties);

              // Auto-zoom closely to the clicked bidang
              if (mapRef.current) {
                const anyFLayer = fLayer as any;
                if (anyFLayer.getBounds) {
                  mapRef.current.fitBounds(anyFLayer.getBounds(), { padding: [40, 40], maxZoom: 20 });
                } else if (anyFLayer.getLatLng) {
                  mapRef.current.setView(anyFLayer.getLatLng(), 20);
                }
              }

              // Auto-select corresponding LandRecord if matched
              const matched = records.find(r => {
                const recordNobid = r.NOBID || '';
                const recordDesa = r.DESA || '';
                const recordSpan = r.SPAN || '';

                return isRecordMatched(nobid, desa, span, recordNobid, recordDesa, recordSpan);
              });

              if (matched) {
                setSelectedRecord(matched);
              } else {
                setSelectedRecord(null);
              }
            });
          }
        }
      }).addTo(map);

      geojsonLayersRef.current[layer.id] = leafLayer;
    });

    // Fit map bounds to loaded layers only when they are first added (prevent resetting zoom when selecting record)
    const visibleLayers = Object.values(geojsonLayersRef.current);
    const newLayerIds = loadedGeoJSONs.filter(g => g.visible && !fittedLayersRef.current.includes(g.id)).map(g => g.id);
    
    if (newLayerIds.length > 0 && visibleLayers.length > 0) {
      try {
        const newLayers = newLayerIds.map(id => geojsonLayersRef.current[id]).filter(Boolean);
        if (newLayers.length > 0) {
          const group = L.featureGroup(newLayers as L.Layer[]);
          map.fitBounds(group.getBounds(), { padding: [30, 30] });
        }
        fittedLayersRef.current = [...fittedLayersRef.current, ...newLayerIds];
      } catch (err) {
        // Safe check for geometry issues
      }
    }

  }, [loadedGeoJSONs, selectedRecord, records]);

  // Center on map helper
  const handleSelectRecord = (record: LandRecord) => {
    setSelectedRecord(record);
    setSelectedFeatureProps(null);

    // Look through loaded GeoJSONs for the matching parcel boundary and zoom/center
    let centered = false;
    Object.keys(geojsonLayersRef.current).forEach(key => {
      const geojsonLayer = geojsonLayersRef.current[key];
      const layerObj = loadedGeoJSONs.find(l => l.id === key);
      if (!layerObj) return;

      geojsonLayer.eachLayer((subLayer: any) => {
        const featProps = subLayer.feature?.properties || {};
        const featNobid = getNobidOfBidang(featProps, layerObj);
        const featDesa = getDesaOfBidang(featProps, layerObj);
        const featSpan = getSpanOfBidang(featProps, layerObj);
        
        const recordNobid = record.NOBID || '';
        const recordDesa = record.DESA || '';
        const recordSpan = record.SPAN || '';

        if (isRecordMatched(featNobid, featDesa, featSpan, recordNobid, recordDesa, recordSpan)) {
          if (mapRef.current) {
            if (subLayer.getBounds) {
              mapRef.current.fitBounds(subLayer.getBounds(), { padding: [40, 40], maxZoom: 20 });
            } else if (subLayer.getLatLng) {
              mapRef.current.setView(subLayer.getLatLng(), 20);
            }
            centered = true;
          }
        }
      });
    });

    // Fallback: search-based coordinate fetching from Google Map/Nominatim if no GeoJSON match is loaded
    if (!centered && mapRef.current) {
      // Center around average Central Java based on Desa name
      const queryStr = `${record.DESA || ''}, Kecamatan ${record.KECAMATAN || ''}, Jawa Tengah, Indonesia`;
      fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryStr)}`)
        .then(res => res.json())
        .then(data => {
          if (data && data[0] && mapRef.current) {
            const lat = parseFloat(data[0].lat);
            const lon = parseFloat(data[0].lon);
            mapRef.current.setView([lat, lon], 15);
          }
        })
        .catch(() => {});
    }
  };

  // Direct GeoJSON local upload handling via client-side FileReader
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'bidang' | 'jalur' | 'tower') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        const nameClean = file.name.replace(/\.[^/.]+$/, ""); // strip extension
        handleAddGeoJSON(json, `${nameClean} (${type.toUpperCase()})`, type);
      } catch (err) {
        alert('File format salah! Pastikan mengunggah file .geojson yang valid.');
      }
    };
    reader.readAsText(file);
    // Clear input
    e.target.value = '';
  };

  return (
    <div className="space-y-6" id="interactive_gis_map_root">
      
      {/* Top Header Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-card p-6 rounded-2xl shadow-xl">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2 font-sans">
            <MapIcon className="w-6 h-6 text-indigo-400" />
            Sistem Informasi Geografis & Peta Spasial (GIS)
          </h1>
          <p className="text-slate-300 text-sm mt-1 font-sans">
            Visualisasi bidang tanah jalur transmisi, tapak tower, koridor bebas hambatan (ROW), dan data kepemilikan.
          </p>
        </div>

        {/* Basemap Toggle Buttons */}
        <div className="flex items-center gap-2.5 bg-slate-900/60 p-1 rounded-xl border border-white/10 self-start md:self-center">
          <button
            onClick={() => setBasemap('google')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              basemap === 'google'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Google Satellite Hybrid (Mendukung Zoom Sangat Detail)"
          >
            <Globe className="w-3.5 h-3.5 text-emerald-400" />
            Satelit Google
          </button>
          <button
            onClick={() => setBasemap('satelit')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              basemap === 'satelit'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Esri World Imagery"
          >
            <Globe className="w-3.5 h-3.5" />
            Satelit Esri
          </button>
          <button
            onClick={() => setBasemap('osm')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              basemap === 'osm'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            Vektor OSM
          </button>
        </div>
      </div>

      {/* Sub Menu / Tab Selector */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-0.5">
        <button
          onClick={() => setActiveSubTab('peta')}
          className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            activeSubTab === 'peta'
              ? 'border-indigo-500 text-indigo-300 bg-indigo-500/5 rounded-t-xl'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <MapIcon className="w-4 h-4 text-indigo-400" />
          Peta & Navigasi Spasial
        </button>
        <button
          onClick={() => setActiveSubTab('geojson')}
          className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            activeSubTab === 'geojson'
              ? 'border-indigo-500 text-indigo-300 bg-indigo-500/5 rounded-t-xl'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-4 h-4 text-indigo-400" />
          Manajemen Berkas GeoJSON
          {loadedGeoJSONs.length > 0 && (
            <span className="bg-indigo-500/20 text-indigo-300 text-[10px] px-1.5 py-0.5 rounded-full border border-indigo-500/30">
              {loadedGeoJSONs.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab: Peta & Navigasi Spasial */}
      <div className={activeSubTab === 'peta' ? 'space-y-6 block' : 'hidden'}>
        {/* Main Map Split Container */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left/Middle Column - Map Canvas (takes 2/3 on desktop) */}
          <div className="lg:col-span-2 space-y-4">
            <div className="glass-card rounded-2xl overflow-hidden shadow-2xl border border-white/10 relative">
              
              {/* Map Div */}
              <div 
                ref={mapContainerRef} 
                className="w-full h-[550px] bg-slate-950 z-10" 
                style={{ minHeight: '500px' }}
              />

              {/* Float Legend/Overlay on the bottom-left */}
              <div className="absolute bottom-4 left-4 z-[400] glass-card-dark p-3.5 rounded-xl shadow-lg border border-white/10 space-y-2 max-w-xs text-xs">
                <h3 className="font-bold text-white mb-1">Legenda Peta</h3>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 bg-emerald-500/30 border border-emerald-400 rounded"></span>
                  <span className="text-slate-300">Bidang Tanah (Normal)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 bg-blue-500/50 border border-blue-400 rounded animate-pulse"></span>
                  <span className="text-slate-300">Bidang Terpilih</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-0.5 border-t-2 border-dashed border-orange-500 block"></span>
                  <span className="text-slate-300">Jalur Transmisi ROW</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full bg-indigo-600 border border-white flex items-center justify-center text-[8px]">🗼</span>
                  <span className="text-slate-300">Tapak Tower (Point)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Map Sidebar with Navigator Bidang (takes 1/3 on desktop) */}
          <div className="lg:col-span-1">
            {/* Quick Search & Navigator List */}
            <div className="glass-card p-5 rounded-2xl shadow-xl border border-white/10 space-y-4 flex flex-col h-[550px]">
              <h2 className="text-base font-bold text-white flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Search className="w-5 h-5 text-indigo-400" />
                  Navigator Bidang
                </span>
                <span className="text-slate-400 font-mono text-xs">({filteredRecords.length})</span>
              </h2>

              {/* Filters */}
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Cari Pemilik, No Bidang, Span..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-1.5 bg-slate-950 border border-white/10 text-white placeholder-slate-500 rounded-xl text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <select
                  value={selectedDesa}
                  onChange={(e) => setSelectedDesa(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-950 border border-white/10 text-slate-200 rounded-xl text-xs focus:outline-none focus:border-indigo-500"
                >
                  {desas.map((d) => (
                    <option key={d} value={d}>
                      {d === 'ALL' ? 'Semua Desa' : `Desa ${d}`}
                    </option>
                  ))}
                </select>
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto scrollbar-thin space-y-1.5 pr-1">
                {filteredRecords.length === 0 ? (
                  <div className="py-8 text-center text-slate-600 text-xs">
                    Tidak ditemukan data bidang
                  </div>
                ) : (
                  filteredRecords.map((r, i) => (
                    <button
                      key={r.ID_UNIK || i}
                      onClick={() => handleSelectRecord(r)}
                      className={`w-full text-left p-2 rounded-xl text-xs flex items-center justify-between border transition-all cursor-pointer ${
                        selectedRecord?.ID_UNIK === r.ID_UNIK
                          ? 'bg-indigo-600/35 border-indigo-500 text-white'
                          : 'bg-white/2.5 hover:bg-white/5 border-transparent text-slate-300'
                      }`}
                    >
                      <div className="overflow-hidden mr-2">
                        <p className="font-bold truncate">{r.NAMA || 'Tanpa Nama'}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                          Desa {r.DESA} &bull; Span {r.SPAN} &bull; No. {r.NOBID}
                        </p>
                      </div>
                      <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${
                        selectedRecord?.ID_UNIK === r.ID_UNIK ? 'rotate-90 text-indigo-300' : 'text-slate-500'
                      }`} />
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

        </div>

        {/* Detailed Inspector Card (Full Width below map & navigator) */}
        <div className="glass-card p-6 rounded-2xl shadow-xl border border-white/10 space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2 border-b border-white/10 pb-2.5">
            <Info className="w-5 h-5 text-indigo-400" />
            Inspektur Detail Bidang
          </h2>

          {selectedRecord ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fadeIn">
              {/* Col 1: Header Info & Mini details */}
              <div className="space-y-4">
                <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-indigo-300 font-bold bg-indigo-500/15 px-2 py-0.5 rounded-full">
                      CODE: {selectedRecord.CODE || '-'}
                    </span>
                    
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                      selectedRecord.QC_STATUS === 'APPROVED' 
                        ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/25' 
                        : selectedRecord.QC_STATUS === 'REJECTED'
                        ? 'bg-rose-500/10 text-rose-300 border border-rose-500/25'
                        : 'bg-amber-500/10 text-amber-300 border border-amber-500/25'
                    }`}>
                      {selectedRecord.QC_STATUS === 'APPROVED' && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                      {selectedRecord.QC_STATUS === 'REJECTED' && <XCircle className="w-3 h-3 text-rose-400" />}
                      {(!selectedRecord.QC_STATUS || selectedRecord.QC_STATUS === 'PENDING') && <Clock className="w-3 h-3 text-amber-400" />}
                      {selectedRecord.QC_STATUS || 'PENDING'}
                    </span>
                  </div>
                  <h3 className="font-bold text-lg text-white font-sans mt-1">
                    {selectedRecord.NAMA || 'Nama Pemilik Tidak Ada'}
                  </h3>
                  <p className="text-xs text-slate-300">
                    Desa {selectedRecord.DESA} &bull; Span {selectedRecord.SPAN} &bull; Bidang No. {selectedRecord.NOBID}
                  </p>
                </div>

                <div className="p-3.5 bg-white/2.5 rounded-xl border border-white/5 space-y-2.5">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Bangunan Terdata:</span>
                    <span className="text-white font-bold font-mono">
                      {selectedRecord.buildings?.filter(b => b.luas).length || 0} Unit
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Tanaman Produktif:</span>
                    <span className="text-white font-bold font-mono">
                      {selectedRecord.plants?.filter(p => p.jenis).length || 0} Jenis
                    </span>
                  </div>
                </div>
              </div>

              {/* Col 2: Information Grid */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-300 tracking-wider uppercase mb-1.5">Metrik Lahan</h4>
                <div className="grid grid-cols-2 gap-3.5 text-xs">
                  <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                    <p className="text-slate-400 text-[10px] uppercase tracking-wider">Luas Lahan</p>
                    <p className="font-bold text-white mt-1 text-sm">{parseFloat(selectedRecord.LUAS || '0').toLocaleString('id-ID')} m²</p>
                  </div>
                  <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                    <p className="text-slate-400 text-[10px] uppercase tracking-wider">Penutup Lahan</p>
                    <p className="font-bold text-white mt-1 text-sm truncate" title={selectedRecord.PENUTUP_LAHAN}>{selectedRecord.PENUTUP_LAHAN || 'SAWAH'}</p>
                  </div>
                  <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                    <p className="text-slate-400 text-[10px] uppercase tracking-wider">Pemberkasan</p>
                    <p className="font-semibold text-white mt-1 text-sm">{selectedRecord.PROGRES_PEMBERKASAN || 'BELUM'}</p>
                  </div>
                  <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                    <p className="text-slate-400 text-[10px] uppercase tracking-wider">Trabas Upload</p>
                    <p className="font-semibold text-white mt-1 text-sm">{selectedRecord.PROGRES_UPLOAD_TRABAS || 'BELUM'}</p>
                  </div>
                </div>
              </div>

              {/* Col 3: Document Links Section */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-300 tracking-wider uppercase mb-1.5">Berkas Dokumen Pendukung</h4>
                <div className="grid grid-cols-2 gap-2.5 text-[11px]">
                  {selectedRecord.LINK_KTP ? (
                    <a href={selectedRecord.LINK_KTP} target="_blank" rel="noopener noreferrer" className="p-3 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 rounded-xl border border-indigo-500/20 flex items-center gap-1.5 transition-all truncate">
                      <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0" /> KTP Pemilik
                    </a>
                  ) : (
                    <span className="p-3 bg-slate-900/40 text-slate-500 rounded-xl border border-white/5 flex items-center gap-1.5 truncate">
                      <FileText className="w-3.5 h-3.5 text-slate-600 shrink-0" /> KTP (Kosong)
                    </span>
                  )}

                  {selectedRecord.LINK_KK ? (
                    <a href={selectedRecord.LINK_KK} target="_blank" rel="noopener noreferrer" className="p-3 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 rounded-xl border border-indigo-500/20 flex items-center gap-1.5 transition-all truncate">
                      <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0" /> KK Pemilik
                    </a>
                  ) : (
                    <span className="p-3 bg-slate-900/40 text-slate-500 rounded-xl border border-white/5 flex items-center gap-1.5 truncate">
                      <FileText className="w-3.5 h-3.5 text-slate-600 shrink-0" /> KK (Kosong)
                    </span>
                  )}

                  {selectedRecord.LINK_ALAS_HAK ? (
                    <a href={selectedRecord.LINK_ALAS_HAK} target="_blank" rel="noopener noreferrer" className="p-3 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 rounded-xl border border-indigo-500/20 flex items-center gap-1.5 transition-all truncate">
                      <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0" /> Alas Hak
                    </a>
                  ) : (
                    <span className="p-3 bg-slate-900/40 text-slate-500 rounded-xl border border-white/5 flex items-center gap-1.5 truncate">
                      <FileText className="w-3.5 h-3.5 text-slate-600 shrink-0" /> Alas Hak (Kosong)
                    </span>
                  )}

                  {selectedRecord.LINK_DOKUMENTASI_BIDANG ? (
                    <a href={selectedRecord.LINK_DOKUMENTASI_BIDANG} target="_blank" rel="noopener noreferrer" className="p-3 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 rounded-xl border border-indigo-500/20 flex items-center gap-1.5 transition-all truncate">
                      <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0" /> Foto Bidang
                    </a>
                  ) : (
                    <span className="p-3 bg-slate-900/40 text-slate-500 rounded-xl border border-white/5 flex items-center gap-1.5 truncate">
                      <FileText className="w-3.5 h-3.5 text-slate-600 shrink-0" /> Foto Bidang (Kosong)
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : selectedFeatureProps ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fadeIn">
              <div className="p-4 bg-slate-850 border border-white/10 rounded-xl space-y-2">
                <h3 className="font-bold text-sm text-amber-300">
                  Poligon Peta Terpilih (Belum Tercatat)
                </h3>
                <p className="text-xs text-slate-400">
                  Poligon di klik tidak mempunyai baris data yang cocok dengan kode/nobid di database saat ini.
                </p>
              </div>
              
              <div className="bg-white/5 p-4 rounded-xl border border-white/5 space-y-2 text-xs">
                <p className="font-bold text-slate-300 uppercase tracking-wider text-[10px]">Properties Atribut:</p>
                <pre className="font-mono text-[10px] text-indigo-200 overflow-x-auto max-h-40 scrollbar-thin whitespace-pre-wrap">
                  {JSON.stringify(selectedFeatureProps, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-slate-500 text-xs flex flex-col items-center justify-center space-y-2">
              <MapPin className="w-8 h-8 text-slate-600 animate-bounce" />
              <p className="font-semibold text-slate-400">Belum ada bidang yang dipilih.</p>
              <p className="text-[11px] text-slate-600 max-w-md">Klik poligon bidang di peta atau pilih baris data dari panel Navigator Bidang di samping peta untuk melihat rincian.</p>
            </div>
          )}
        </div>
      </div>

      {/* Tab: Manajemen Berkas GeoJSON */}
      <div className={activeSubTab === 'geojson' ? 'glass-card p-6 rounded-2xl shadow-xl border border-white/10 space-y-6 animate-fadeIn block' : 'hidden'}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-400" />
              Manajemen File GeoJSON
            </h2>
            <p className="text-xs text-slate-400 mt-1">Unggah, aktifkan, atau atur pemetaan kolom atribut file spasial Anda.</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <HelpCircle className="w-4 h-4 text-slate-500" />
            <span>Simpan file GeoJSON Anda di folder <code>/public/geojson/</code></span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          
          {/* Card upload Bidang */}
          <div className="p-4 bg-slate-900/40 rounded-xl border border-white/5 flex flex-col justify-between space-y-3">
            <div>
              <h4 className="text-xs font-bold text-emerald-300">1. GeoJSON Bidang Tanah</h4>
              <p className="text-[11px] text-slate-400 mt-0.5">Poligon bidang per-desa/per-jalur untuk memetakan kepemilikan lahan.</p>
            </div>
            <label className="px-3 py-2 bg-slate-800 hover:bg-slate-750 border border-white/10 text-white rounded-lg text-xs font-semibold text-center cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-md">
              <UploadCloud className="w-3.5 h-3.5 text-indigo-400" />
              Unggah Bidang
              <input type="file" accept=".geojson,application/json" onChange={(e) => handleFileUpload(e, 'bidang')} className="hidden" />
            </label>
          </div>

          {/* Card upload Jalur */}
          <div className="p-4 bg-slate-900/40 rounded-xl border border-white/5 flex flex-col justify-between space-y-3">
            <div>
              <h4 className="text-xs font-bold text-orange-300">2. GeoJSON Jalur Corridor</h4>
              <p className="text-[11px] text-slate-400 mt-0.5">Garis koridor/buffer bebas hambatan ROW transmisi 150 kV.</p>
            </div>
            <label className="px-3 py-2 bg-slate-800 hover:bg-slate-750 border border-white/10 text-white rounded-lg text-xs font-semibold text-center cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-md">
              <UploadCloud className="w-3.5 h-3.5 text-indigo-400" />
              Unggah Jalur
              <input type="file" accept=".geojson,application/json" onChange={(e) => handleFileUpload(e, 'jalur')} className="hidden" />
            </label>
          </div>

          {/* Card upload Tower */}
          <div className="p-4 bg-slate-900/40 rounded-xl border border-white/5 flex flex-col justify-between space-y-3">
            <div>
              <h4 className="text-xs font-bold text-indigo-300">3. GeoJSON Tapak Tower</h4>
              <p className="text-[11px] text-slate-400 mt-0.5">Titik posisi koordinat tower penyangga lengkap dengan label nomor tower.</p>
            </div>
            <label className="px-3 py-2 bg-slate-800 hover:bg-slate-750 border border-white/10 text-white rounded-lg text-xs font-semibold text-center cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-md">
              <UploadCloud className="w-3.5 h-3.5 text-indigo-400" />
              Unggah Tower
              <input type="file" accept=".geojson,application/json" onChange={(e) => handleFileUpload(e, 'tower')} className="hidden" />
            </label>
          </div>

        </div>

        {/* List of currently loaded GeoJSONs */}
        {loadedGeoJSONs.length > 0 ? (
          <div className="border-t border-white/10 pt-5 space-y-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">File Terpasang di Peta ({loadedGeoJSONs.length})</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {loadedGeoJSONs.map((g) => (
                <div key={g.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 text-xs">
                  <div className="flex items-center gap-2.5 overflow-hidden mr-2">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      g.type === 'bidang' ? 'bg-emerald-450' : g.type === 'jalur' ? 'bg-orange-500' : 'bg-indigo-500'
                    }`} />
                    <span className="text-slate-200 font-medium truncate" title={g.name}>{g.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => {
                        setTempMapping(g.fieldMapping || {
                          desa: '',
                          span: '',
                          nobid: '',
                          nama: '',
                          tower: '',
                          jalurName: ''
                        });
                        setConfiguringLayer(g);
                      }}
                      className="p-1.5 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 rounded transition-colors"
                      title="Atur Pemetaan Kolom Atribut"
                    >
                      <Layers className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleToggleVisibility(g.id)}
                      className={`px-2.5 py-1 rounded text-xs font-bold ${
                        g.visible ? 'bg-indigo-500/20 text-indigo-300' : 'bg-slate-850 text-slate-500'
                      }`}
                    >
                      {g.visible ? 'Sembunyikan' : 'Tampilkan'}
                    </button>
                    <button
                      onClick={() => handleRemoveGeoJSON(g.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="border-t border-white/10 pt-6 py-8 text-center text-slate-500 text-xs">
            Belum ada file GeoJSON eksternal yang diunggah. Gunakan tombol di atas untuk mengunggah file lokal Anda.
          </div>
        )}

        {/* Panduan Integrasi Permanen untuk Tamu */}
        <div className="mt-6 p-5 bg-indigo-500/5 rounded-2xl border border-indigo-500/25 space-y-3.5">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-indigo-600/20 text-indigo-300 rounded-lg shrink-0 mt-0.5">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-indigo-300 uppercase tracking-wider">💡 Bagaimana cara memisahkan file GeoJSON antar proyek agar tampil otomatis untuk Tamu?</h3>
              <p className="text-xs text-slate-300 mt-1">
                Aplikasi ini mendukung <strong>multi-proyek/jalur yang independen</strong>. Agar tamu proyek tertentu langsung melihat jalurnya sendiri tanpa tercampur dengan proyek lain, gunakan format penamaan file berbasis nama proyek/jalur di bawah ini:
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pl-0 md:pl-11 text-xs">
            <div className="p-3 bg-slate-900/60 rounded-xl border border-white/5 space-y-1">
              <span className="font-bold text-indigo-400">Langkah 1: Letakkan File</span>
              <p className="text-[11px] text-slate-300">
                Letakkan file GeoJSON Anda di folder publik proyek Anda di path:
                <code className="block mt-1 p-1 bg-slate-950 rounded text-[10px] text-amber-300 border border-white/5 font-mono select-all">/public/geojson/</code>
              </p>
            </div>
            <div className="p-3 bg-slate-900/60 rounded-xl border border-white/5 space-y-1">
              <span className="font-bold text-indigo-400">Langkah 2: Penamaan File ({activeProjectName || 'Pilih Proyek'})</span>
              <p className="text-[11px] text-slate-300">
                Ubah nama file GeoJSON sesuai nama proyek aktif agar termuat otomatis:
                <span className="block mt-1.5 space-y-1 text-[10px] font-mono text-indigo-300">
                  • <strong>Bidang:</strong> <code className="text-amber-200 block bg-slate-950 p-1 rounded border border-white/5 font-mono select-all truncate">{(activeProjectName || 'PROYEK_ANDA')}_BIDANG_WARGA.geojson</code>
                  • <strong>Jalur:</strong> <code className="text-amber-200 block bg-slate-950 p-1 rounded border border-white/5 font-mono select-all truncate">{(activeProjectName || 'PROYEK_ANDA')}_JALUR_UTUH.geojson</code>
                  • <strong>Tower:</strong> <code className="text-amber-200 block bg-slate-950 p-1 rounded border border-white/5 font-mono select-all truncate">{(activeProjectName || 'PROYEK_ANDA')}_TAPAK_TOWER.geojson</code>
                </span>
                <span className="text-[9px] text-slate-400 block mt-1.5">
                  *Gunakan format default jika ingin dijadikan fallback global (misal: <code className="text-indigo-200">bidang_tanah.geojson</code>).
                </span>
              </p>
            </div>
            <div className="p-3 bg-slate-900/60 rounded-xl border border-white/5 space-y-1">
              <span className="font-bold text-indigo-400">Langkah 3: Deploy</span>
              <p className="text-[11px] text-slate-300">
                Lakukan <strong>Deploy Ulang</strong> aplikasi Anda. Setelah terdeploy, sistem akan otomatis mengenali nama proyek yang dipilih tamu dan memuat file GeoJSON yang sesuai secara independen tanpa tercampur!
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Dynamic Column Mapping Configuration Modal */}
      {configuringLayer && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-scaleUp">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between bg-slate-950/40">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-400" />
                <div>
                  <h3 className="font-bold text-white text-sm">Pemetaan Kolom Atribut GIS</h3>
                  <p className="text-[11px] text-slate-400 truncate max-w-[280px]">{configuringLayer.name}</p>
                </div>
              </div>
              <button 
                onClick={() => setConfiguringLayer(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-300 leading-relaxed">
                Pilih nama field (kolom) dari file GeoJSON Anda yang menyimpan data berikut untuk dicocokkan dengan database aplikasi secara real-time.
              </p>

              {/* List of fields in GeoJSON to show for reference */}
              <div className="bg-slate-950 p-3 rounded-xl border border-white/5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Kolom Tersedia di File:</p>
                <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto scrollbar-thin">
                  {getGeoJSONKeys(configuringLayer.data).map(key => (
                    <span key={key} className="text-[9px] font-mono px-1.5 py-0.5 bg-white/5 text-indigo-300 rounded border border-white/5">
                      {key}
                    </span>
                  ))}
                  {getGeoJSONKeys(configuringLayer.data).length === 0 && (
                    <span className="text-[10px] text-slate-500 font-mono">Tidak ada kolom ditemukan</span>
                  )}
                </div>
              </div>

              <div className="space-y-3.5">
                {configuringLayer.type === 'bidang' && (
                  <>
                    {/* Desa */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-300 flex justify-between">
                        <span>Nama Desa / Kelurahan:</span>
                        <span className="text-emerald-400 font-normal text-[10px]">Auto-detect fallback</span>
                      </label>
                      <select
                        value={tempMapping.desa || ''}
                        onChange={(e) => setTempMapping({ ...tempMapping, desa: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-950 border border-white/10 text-slate-200 rounded-xl text-xs focus:outline-none focus:border-indigo-500"
                      >
                        <option value="">-- Gunakan Auto-Detect --</option>
                        {getGeoJSONKeys(configuringLayer.data).map(key => (
                          <option key={key} value={key}>{key}</option>
                        ))}
                      </select>
                    </div>

                    {/* Span */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-300 flex justify-between">
                        <span>Span / Section (T.xx-T.xx):</span>
                        <span className="text-emerald-400 font-normal text-[10px]">Auto-detect fallback</span>
                      </label>
                      <select
                        value={tempMapping.span || ''}
                        onChange={(e) => setTempMapping({ ...tempMapping, span: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-950 border border-white/10 text-slate-200 rounded-xl text-xs focus:outline-none focus:border-indigo-500"
                      >
                        <option value="">-- Gunakan Auto-Detect --</option>
                        {getGeoJSONKeys(configuringLayer.data).map(key => (
                          <option key={key} value={key}>{key}</option>
                        ))}
                      </select>
                    </div>

                    {/* Nobid */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-300 flex justify-between">
                        <span>Nomor Bidang Tanah (NOBID):</span>
                        <span className="text-emerald-400 font-normal text-[10px]">Auto-detect fallback</span>
                      </label>
                      <select
                        value={tempMapping.nobid || ''}
                        onChange={(e) => setTempMapping({ ...tempMapping, nobid: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-950 border border-white/10 text-slate-200 rounded-xl text-xs focus:outline-none focus:border-indigo-500"
                      >
                        <option value="">-- Gunakan Auto-Detect --</option>
                        {getGeoJSONKeys(configuringLayer.data).map(key => (
                          <option key={key} value={key}>{key}</option>
                        ))}
                      </select>
                    </div>

                    {/* Nama Pemilik */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-300 flex justify-between">
                        <span>Nama Pemilik (Nama Final):</span>
                        <span className="text-emerald-400 font-normal text-[10px]">Auto-detect fallback</span>
                      </label>
                      <select
                        value={tempMapping.nama || ''}
                        onChange={(e) => setTempMapping({ ...tempMapping, nama: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-950 border border-white/10 text-slate-200 rounded-xl text-xs focus:outline-none focus:border-indigo-500"
                      >
                        <option value="">-- Gunakan Auto-Detect --</option>
                        {getGeoJSONKeys(configuringLayer.data).map(key => (
                          <option key={key} value={key}>{key}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                {configuringLayer.type === 'tower' && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-300 flex justify-between">
                      <span>Nomor / Label Tower (towernumb):</span>
                      <span className="text-indigo-400 font-normal text-[10px]">Auto-detect fallback</span>
                    </label>
                    <select
                      value={tempMapping.tower || ''}
                      onChange={(e) => setTempMapping({ ...tempMapping, tower: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-white/10 text-slate-200 rounded-xl text-xs focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">-- Gunakan Auto-Detect --</option>
                      {getGeoJSONKeys(configuringLayer.data).map(key => (
                        <option key={key} value={key}>{key}</option>
                      ))}
                    </select>
                  </div>
                )}

                {configuringLayer.type === 'jalur' && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-300 flex justify-between">
                      <span>Nama Jalur / Koridor:</span>
                      <span className="text-orange-400 font-normal text-[10px]">Auto-detect fallback</span>
                    </label>
                    <select
                      value={tempMapping.jalurName || ''}
                      onChange={(e) => setTempMapping({ ...tempMapping, jalurName: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-white/10 text-slate-200 rounded-xl text-xs focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">-- Gunakan Auto-Detect --</option>
                      {getGeoJSONKeys(configuringLayer.data).map(key => (
                        <option key={key} value={key}>{key}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/10 bg-slate-950/40 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setConfiguringLayer(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 rounded-xl text-xs font-semibold cursor-pointer transition-all"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  setLoadedGeoJSONs(prev => prev.map(g => {
                    if (g.id === configuringLayer.id) {
                      return { ...g, fieldMapping: tempMapping };
                    }
                    return g;
                  }));
                  setConfiguringLayer(null);
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-550 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer transition-all"
              >
                Simpan Pemetaan
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
