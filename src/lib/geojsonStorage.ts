import { db } from './firebase';
import { doc, setDoc, deleteDoc, collection, getDocs, onSnapshot } from 'firebase/firestore';

export interface SavedGeoJSONLayer {
  id: string;
  name: string;
  type: 'bidang' | 'jalur' | 'tower';
  data: any;
  visible?: boolean;
  isDefault?: boolean;
  fieldMapping?: any;
  projectId?: string;
  createdAt?: string;
  chunked?: boolean;
  totalChunks?: number;
}

/**
 * Safely saves a layer to localStorage without throwing QuotaExceededError
 */
export function saveLayerToLocalStorage(layer: SavedGeoJSONLayer): void {
  try {
    const localGeoJSONs = JSON.parse(localStorage.getItem('local_geojson_layers') || '[]');
    const filtered = localGeoJSONs.filter((l: any) => l.id !== layer.id);
    
    // Test payload size
    const payloadString = JSON.stringify([...filtered, layer]);
    if (payloadString.length < 4000000) { // ~4MB threshold for localStorage safety
      filtered.push(layer);
      localStorage.setItem('local_geojson_layers', JSON.stringify(filtered));
    } else {
      // Store lightweight version without full feature dump in localStorage
      const lightweightLayer = {
        ...layer,
        data: {
          type: layer.data?.type || 'FeatureCollection',
          features: layer.data?.features ? layer.data.features.slice(0, 50) : []
        }
      };
      filtered.push(lightweightLayer);
      localStorage.setItem('local_geojson_layers', JSON.stringify(filtered));
    }
  } catch (e) {
    console.warn('LocalStorage quota exceeded or unavailable, skipping local cache update:', e);
  }
}

/**
 * Saves a GeoJSON layer to Firestore.
 * Automatically chunks large feature collections across subcollection documents if total payload > 700KB.
 */
export async function saveGeoJSONLayerToFirestore(layer: SavedGeoJSONLayer): Promise<void> {
  const { id, name, type, data, visible = true, isDefault = false, fieldMapping = null, projectId = 'global' } = layer;
  
  const docRef = doc(db, 'geojson_layers', id);
  const dataString = JSON.stringify(data || {});

  // Under 700KB: Save directly in single document
  if (dataString.length < 700000) {
    await setDoc(docRef, {
      name,
      type,
      data,
      visible,
      isDefault,
      fieldMapping,
      projectId,
      createdAt: layer.createdAt || new Date().toISOString(),
      chunked: false
    });
    return;
  }

  // Large GeoJSON (>700KB): Chunk features array across subcollection
  const features = Array.isArray(data?.features) ? data.features : [];
  const targetChunkBytes = 400000; // ~400KB per chunk
  const estimatedChunkCount = Math.max(2, Math.ceil(dataString.length / targetChunkBytes));
  const chunkSize = Math.max(10, Math.ceil(features.length / estimatedChunkCount));
  
  const chunks: any[][] = [];
  for (let i = 0; i < features.length; i += chunkSize) {
    chunks.push(features.slice(i, i + chunkSize));
  }

  // 1. Save metadata document in root collection
  await setDoc(docRef, {
    name,
    type,
    data: { ...data, features: [] },
    visible,
    isDefault,
    fieldMapping,
    projectId,
    createdAt: layer.createdAt || new Date().toISOString(),
    chunked: true,
    totalChunks: chunks.length,
    totalFeatures: features.length
  });

  // 2. Save each chunk into subcollection 'chunks'
  for (let i = 0; i < chunks.length; i++) {
    const chunkRef = doc(db, 'geojson_layers', id, 'chunks', `chunk_${i}`);
    await setDoc(chunkRef, {
      chunkIndex: i,
      features: chunks[i]
    });
  }
}

/**
 * Reconstructs a full layer from a Firestore doc snapshot (assembling chunked subcollections if needed).
 */
export async function loadGeoJSONLayerDoc(docSnap: any): Promise<SavedGeoJSONLayer> {
  const item = docSnap.data();
  const layerId = docSnap.id;

  let layerData = item.data;

  // Reconstruct chunked features
  if (item.chunked && item.totalChunks > 0) {
    try {
      const chunksSnap = await getDocs(collection(db, 'geojson_layers', layerId, 'chunks'));
      const chunkDocs: { index: number; features: any[] }[] = [];
      chunksSnap.forEach(cSnap => {
        const cData = cSnap.data();
        chunkDocs.push({
          index: cData.chunkIndex ?? 0,
          features: cData.features || []
        });
      });

      chunkDocs.sort((a, b) => a.index - b.index);
      const allFeatures = chunkDocs.flatMap(c => c.features);

      layerData = {
        ...item.data,
        type: item.data?.type || 'FeatureCollection',
        features: allFeatures
      };
    } catch (err) {
      console.warn(`Gagal memuat chunk GeoJSON ${layerId}:`, err);
    }
  }

  return {
    id: layerId,
    name: item.name || '',
    type: item.type || 'bidang',
    data: layerData,
    visible: item.visible !== undefined ? item.visible : true,
    isDefault: item.isDefault || false,
    fieldMapping: item.fieldMapping || null,
    projectId: item.projectId || 'global',
    createdAt: item.createdAt,
    chunked: item.chunked,
    totalChunks: item.totalChunks
  };
}

/**
 * Deletes a GeoJSON layer and its chunk subcollection if present.
 */
export async function deleteGeoJSONLayerFromFirestore(id: string, isChunked?: boolean): Promise<void> {
  try {
    const chunksSnap = await getDocs(collection(db, 'geojson_layers', id, 'chunks'));
    const deletePromises: Promise<void>[] = [];
    chunksSnap.forEach(cSnap => {
      deletePromises.push(deleteDoc(cSnap.ref));
    });
    if (deletePromises.length > 0) {
      await Promise.all(deletePromises);
    }
  } catch (e) {}

  await deleteDoc(doc(db, 'geojson_layers', id));
}
