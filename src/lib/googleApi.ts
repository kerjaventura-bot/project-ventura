import { type LandRecord, getSheetHeaders, recordToRow, rowToRecord } from '../types';

// Constants
export const SPREADSHEET_NAME = "Data_Pertanahan_Desa_SIP";
export const MAIN_FOLDER_NAME = "SIP_Berkas_Pertanahan_Desa";

/**
 * Fetch wrapper with built-in timeout to prevent requests from hanging indefinitely
 */
export async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs: number = 30000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`Koneksi Google API timeout (${timeoutMs / 1000} detik).`);
    }
    throw err;
  } finally {
    clearTimeout(id);
  }
}

/**
 * Extracts and throws detailed error messages from Google API response bodies
 */
async function handleResponseError(response: Response, defaultMessage: string): Promise<never> {
  let detail = "";
  try {
    const data = await response.json();
    if (data && data.error && data.error.message) {
      detail = data.error.message;
    }
  } catch (e) {
    // ignore non-json errors
  }
  const errorMessage = detail ? `${defaultMessage}: ${detail}` : `${defaultMessage} (${response.statusText || 'HTTP ' + response.status})`;
  throw new Error(errorMessage);
}

/**
 * Searches for the master spreadsheet in Drive.
 * If not found, creates it and initializes headers.
 */
export async function findOrCreateSpreadsheet(accessToken: string, spreadsheetName: string = SPREADSHEET_NAME, parentFolderId?: string): Promise<string> {
  try {
    let query = `name='${spreadsheetName}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
    if (parentFolderId) {
      query += ` and '${parentFolderId}' in parents`;
    }
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;
    
    const response = await fetchWithTimeout(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    if (!response.ok) {
      await handleResponseError(response, "Gagal mencari spreadsheet");
    }
    
    const data = await response.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
    
    // Create new spreadsheet inside specific folder using Drive API v3
    const body: any = {
      name: spreadsheetName,
      mimeType: 'application/vnd.google-apps.spreadsheet'
    };
    if (parentFolderId) {
      body.parents = [parentFolderId];
    }
    
    const createResponse = await fetchWithTimeout('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    
    if (!createResponse.ok) {
      await handleResponseError(createResponse, "Gagal membuat spreadsheet baru di Drive");
    }
    
    const spreadsheet = await createResponse.json();
    const spreadsheetId = spreadsheet.id;
    
    // Initialize headers in the first row
    const headers = getSheetHeaders();
    const updateResponse = await fetchWithTimeout(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        values: [headers]
      })
    });
    
    if (!updateResponse.ok) {
      console.error("Gagal mengisi header spreadsheet:", await updateResponse.text());
    }
    
    return spreadsheetId;
  } catch (err) {
    console.error("Error findOrCreateSpreadsheet:", err);
    throw err;
  }
}

/**
 * Automates the creation of Google Drive folders and spreadsheet for a given project.
 */
export async function setupProjectDriveStructure(
  accessToken: string,
  projectName: string
): Promise<{ folderId: string; spreadsheetId: string; uploadsFolderId: string }> {
  try {
    // 1. Find or create the root app folder "PROJECT_VENTURA"
    const rootFolderId = await findOrCreateFolder(accessToken, "PROJECT_VENTURA");
    
    // 2. Find or create the specific project folder under "PROJECT_VENTURA"
    const projectFolderId = await findOrCreateFolder(accessToken, projectName, rootFolderId);
    
    // 3. Find or create the spreadsheet inside the project folder
    const spreadsheetName = `Data_Lahan_${projectName.replace(/[\/\\?%*:|"<>\s]/g, '_')}`;
    const spreadsheetId = await findOrCreateSpreadsheet(accessToken, spreadsheetName, projectFolderId);
    
    // 4. Find or create the upload files subfolder inside the project folder
    const uploadsFolderId = await findOrCreateFolder(accessToken, "SIP_Berkas_Pertanahan_Desa", projectFolderId);
    
    return {
      folderId: projectFolderId,
      spreadsheetId,
      uploadsFolderId
    };
  } catch (err) {
    console.error("Error setting up project drive structure:", err);
    throw err;
  }
}

/**
 * Fetches all records from the spreadsheet, ensuring headers are up-to-date and all records have UIDs.
 */
export async function fetchSpreadsheetRecords(accessToken: string, spreadsheetId: string): Promise<LandRecord[]> {
  try {
    // Read from A1 to cover headers and all data rows
    const range = "A1:ZZ5000";
    const response = await fetchWithTimeout(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    }, 30000);
    
    if (!response.ok) {
      await handleResponseError(response, "Gagal mengambil data dari spreadsheet");
    }
    
    const data = await response.json();
    const allRows: any[][] = data.values || [];
    
    if (allRows.length === 0) {
      return [];
    }
    
    const headers = allRows[0];
    const dataRows = allRows.slice(1);
    const expectedHeaders = getSheetHeaders();
    let needsHeal = false;
    
    // Check if headers match expected headers
    if (headers.length < expectedHeaders.length) {
      needsHeal = true;
    } else {
      for (let i = 0; i < expectedHeaders.length; i++) {
        if (headers[i] !== expectedHeaders[i]) {
          needsHeal = true;
          break;
        }
      }
    }
    
    // Check if any row has empty ID_UNIK (at index 248) or if there are duplicate ID_UNIKs
    const idUnikIndex = 248;
    const seenSheetIds = new Set<string>();
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      if (row && row.length > 0 && row[0]) {
        const idVal = row.length > idUnikIndex ? row[idUnikIndex] : "";
        if (!idVal) {
          needsHeal = true;
          break;
        }
        if (seenSheetIds.has(idVal)) {
          needsHeal = true;
          break;
        }
        seenSheetIds.add(idVal);
      }
    }
    
    // Perform self-healing if needed
    if (needsHeal) {
      console.log("Self-healing spreadsheet: ensuring headers are aligned and unique UIDs are written to column IO...");
      
      // Update header row to exact specifications (highly lightweight and guaranteed to succeed)
      const headerResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: [expectedHeaders]
        })
      });
      
      if (!headerResponse.ok) {
        console.error("Gagal memperbarui header spreadsheet:", await headerResponse.text());
      }
      
      const seenIds = new Set<string>();
      const ioIpValues: string[][] = [["ID_UNIK", "JENIS_PERALIHAN_HAK"]];
      
      for (let i = 1; i < allRows.length; i++) {
        const row = allRows[i];
        if (row && row.length > 0 && row[0]) {
          // Pad row elements so they match the expected header count
          while (row.length < expectedHeaders.length) {
            row.push("");
          }
          
          let idUnikVal = row[248];
          if (!idUnikVal) {
            const code = row[0];
            idUnikVal = code ? `ID-${code.replace(/[\s-]/g, '_')}_${i}` : `ID-${Math.random().toString(36).substring(2, 11).toUpperCase()}`;
          }
          
          // Guarantee uniqueness of generated/existing UIDs within this set
          let finalId = idUnikVal;
          let counter = 1;
          while (seenIds.has(finalId)) {
            finalId = `${idUnikVal}_${counter}`;
            counter++;
          }
          seenIds.add(finalId);
          row[248] = finalId;
          
          if (!row[249]) {
            row[249] = "JUAL-BELI";
          }
          
          ioIpValues.push([finalId, row[249]]);
        } else {
          ioIpValues.push(["", ""]);
        }
      }
      
      // Save healed values back to Google Sheet targeting ONLY column IO and IP (extremely lightweight and safe)
      const ioIpRange = `IO1:IP${ioIpValues.length}`;
      const updateResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${ioIpRange}?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: ioIpValues
        })
      });
      
      if (!updateResponse.ok) {
        console.error("Gagal melakukan update kolom ID_UNIK pada self-healing spreadsheet:", await updateResponse.text());
      }
    }
    
    // Now construct data records for the client
    const seenIdsForClient = new Set<string>();
    const parsedDataRows = allRows.slice(1);
    
    return parsedDataRows
      .filter((row: any[]) => row && row.length > 0 && row[0]) // Ensure CODE is present
      .map((row: any[], idx: number) => {
        const record = rowToRecord(row, idx);
        // Explicitly set the 1-based row number (header is row 1, so row 2 is idx = 0)
        record.rowNumber = idx + 2;
        
        let uniqueId = record.ID_UNIK;
        if (seenIdsForClient.has(uniqueId)) {
          uniqueId = `${uniqueId}_${idx}`;
          record.ID_UNIK = uniqueId;
        }
        seenIdsForClient.add(uniqueId);
        return record;
      });
  } catch (err) {
    console.error("Error fetchSpreadsheetRecords:", err);
    throw err;
  }
}

/**
 * Saves a record (either appending a new row or updating an existing one).
 */
export async function saveRecordToSpreadsheet(
  accessToken: string,
  spreadsheetId: string,
  record: LandRecord,
  isEdit: boolean,
  existingRecords: LandRecord[]
): Promise<void> {
  try {
    const rowValues = recordToRow(record);
    
    if (isEdit) {
      // Prioritize the actual record.rowNumber (precise 1-based index)
      let rowIndex = record.rowNumber;
      
      if (!rowIndex) {
        // Fallback: search by ID_UNIK first
        const match = existingRecords.find(r => r.ID_UNIK === record.ID_UNIK) || existingRecords.find(r => r.CODE === record.CODE);
        if (match && match.rowNumber) {
          rowIndex = match.rowNumber;
        } else {
          const matchIndex = existingRecords.findIndex(r => r.ID_UNIK === record.ID_UNIK) || existingRecords.findIndex(r => r.CODE === record.CODE);
          if (matchIndex !== -1) {
            rowIndex = matchIndex + 2;
          }
        }
      }
      
      if (!rowIndex) {
        throw new Error(`Data dengan CODE ${record.CODE} atau ID ${record.ID_UNIK} tidak ditemukan untuk diedit.`);
      }
      
      const range = `A${rowIndex}`;
      
      const response = await fetchWithTimeout(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: [rowValues]
        })
      });
      
      if (!response.ok) {
        await handleResponseError(response, "Gagal mengupdate baris spreadsheet");
      }
    } else {
      // Append a new row
      const response = await fetchWithTimeout(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:append?valueInputOption=USER_ENTERED`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: [rowValues]
        })
      });
      
      if (!response.ok) {
        await handleResponseError(response, "Gagal menyisipkan baris baru ke spreadsheet");
      }
    }
  } catch (err) {
    console.error("Error saveRecordToSpreadsheet:", err);
    throw err;
  }
}

/**
 * Searches for a folder or creates it under the specified parent.
 */
export async function findOrCreateFolder(
  accessToken: string,
  folderName: string,
  parentId?: string,
  idUnik?: string
): Promise<string> {
  try {
    const validParentId = parentId && /^[a-zA-Z0-9_-]{15,60}$/.test(parentId.trim()) ? parentId.trim() : undefined;
    const parentQuery = validParentId ? `'${validParentId}' in parents` : "'root' in parents";
    let query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and ${parentQuery} and trashed=false`;
    
    // If idUnik is provided, search by idUnik prefix instead of exact name to keep it persistent even after renames!
    if (idUnik) {
      query = `name contains '${idUnik}' and mimeType='application/vnd.google-apps.folder' and ${parentQuery} and trashed=false`;
    }
    
    const response = await fetchWithTimeout(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    if (!response.ok) {
      await handleResponseError(response, "Gagal mencari folder");
    }
    
    const data = await response.json();
    if (data.files && data.files.length > 0) {
      const folderId = data.files[0].id;
      const currentName = data.files[0].name || "";
      const expectedName = idUnik ? `${idUnik}_${folderName}` : folderName;
      
      // If the folder name is outdated (e.g. they changed the display CODE), rename it on the fly!
      if (idUnik && currentName !== expectedName) {
        try {
          await fetchWithTimeout(`https://www.googleapis.com/drive/v3/files/${folderId}`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: expectedName })
          });
        } catch (renameErr) {
          console.warn("Failed to rename folder, continuing anyway:", renameErr);
        }
      }
      return folderId;
    }
    
    // Create the folder
    const finalFolderName = idUnik ? `${idUnik}_${folderName}` : folderName;
    const createResponse = await fetchWithTimeout('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: finalFolderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: validParentId ? [validParentId] : ['root']
      })
    });
    
    if (!createResponse.ok) {
      await handleResponseError(createResponse, "Gagal membuat folder baru");
    }
    
    const folder = await createResponse.json();
    return folder.id;
  } catch (err) {
    console.error("Error findOrCreateFolder:", err);
    throw err;
  }
}

/**
 * Uploads a binary file to a specific Drive folder, with metadata and custom name.
 */
export async function uploadFileToDrive(
  accessToken: string,
  file: File,
  docType: string, // KTP, KK, ALAS_HAK, PERALIHAN_HAK
  recordCode: string,
  folderId: string
): Promise<{ fileId: string; webViewLink: string }> {
  try {
    // Generate custom file name
    const ext = file.name.split('.').pop() || 'pdf';
    const cleanCode = recordCode.replace(/[\/\\?%*:|"<>\s]/g, '-');
    const customFileName = `${docType}_${cleanCode}.${ext}`;
    
    // Validate folderId: must look like a valid Google Drive ID
    const isValidFolderId = folderId && typeof folderId === 'string' && /^[a-zA-Z0-9_-]{15,60}$/.test(folderId.trim());
    const validFolderId = isValidFolderId ? folderId.trim() : undefined;

    const metadata: any = {
      name: customFileName,
      mimeType: file.type || 'application/pdf',
    };
    if (validFolderId) {
      metadata.parents = [validFolderId];
    }

    const boundary = 'sip_upload_boundary_delimiter';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    // Convert file to base64
    const base64Promise = new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
    const base64Data = await base64Promise;

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      `Content-Type: ${file.type || 'application/pdf'}\r\n` +
      'Content-Transfer-Encoding: base64\r\n\r\n' +
      base64Data +
      closeDelimiter;

    let response = await fetchWithTimeout('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartRequestBody
    }, 15000);
    
    if (!response.ok && validFolderId) {
      // If upload failed (e.g. 404 Folder not found), retry uploading without parent folder!
      console.warn("Upload with parent folder failed, retrying without parent folder...");
      delete metadata.parents;
      const retryBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        `Content-Type: ${file.type || 'application/pdf'}\r\n` +
        'Content-Transfer-Encoding: base64\r\n\r\n' +
        base64Data +
        closeDelimiter;

      response = await fetchWithTimeout('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: retryBody
      }, 15000);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload gagal: ${response.statusText} - ${errorText}`);
    }
    
    const fileInfo = await response.json();
    return {
      fileId: fileInfo.id,
      webViewLink: fileInfo.webViewLink || `https://drive.google.com/file/d/${fileInfo.id}/view`
    };
  } catch (err) {
    console.error("Error uploadFileToDrive:", err);
    throw err;
  }
}
