use js_sys::{Array, Object, Uint8Array};
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;

const ID3V2_HEADER_SIZE: usize = 10;
const ID3V1_SIZE: usize = 128;
const FLAC_SIGNATURE: &[u8; 4] = b"fLaC";

const MAX_TEXT_BYTES: usize = 16 * 1024;
const MAX_COVER_BYTES: usize = 4 * 1024 * 1024;

/// Tables de recherche de taux d'échantillonnage MPEG indexées par [version_index][sr_index]
/// version_index: 0 = MPEG2.5, 1 = réservé, 2 = MPEG2, 3 = MPEG1
const MPEG_SAMPLE_RATES: [[u32; 3]; 4] = [
    [11025, 12000, 8000],  // MPEG2.5
    [0, 0, 0],             // réservé
    [22050, 24000, 16000], // MPEG2
    [44100, 48000, 32000], // MPEG1
];

/// Tables de recherche de débit binaire MPEG (kbps)
/// L'index 0 est inutilisé (format libre), l'index 15 est invalide
/// [version_layer_combo][bitrate_index]
/// Combos: 0 = V1/L1, 1 = V1/L2, 2 = V1/L3, 3 = V2/L1, 4 = V2/L2+L3
const MPEG_BITRATES: [[u16; 15]; 5] = [
    // V1, Layer I
    [
        0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448,
    ],
    // V1, Layer II
    [
        0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384,
    ],
    // V1, Layer III
    [
        0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
    ],
    // V2, Layer I
    [
        0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256,
    ],
    // V2, Layer II & III
    [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
];

struct AudioInfo {
    sample_rate: Option<u32>,
    bit_depth: Option<u16>,
    bitrate: Option<u32>,
    channels: Option<u8>,
}

impl AudioInfo {
    fn new() -> Self {
        Self {
            sample_rate: None,
            bit_depth: None,
            bitrate: None,
            channels: None,
        }
    }
}

#[wasm_bindgen]
pub fn parse_metadata(bytes: &[u8]) -> JsValue {
    parse_metadata_with_limits(bytes, MAX_TEXT_BYTES, MAX_COVER_BYTES)
}

#[wasm_bindgen]
pub fn parse_metadata_with_limits(
    bytes: &[u8],
    max_text_bytes: usize,
    max_cover_bytes: usize,
) -> JsValue {
    let mut title: Option<String> = None;
    let mut artist: Option<String> = None;
    let mut album: Option<String> = None;
    let mut cover_mime: Option<String> = None;
    let mut cover_data: Option<Vec<u8>> = None;
    let mut cover_type: Option<u8> = None;
    let mut audio_info = AudioInfo::new();

    if bytes.len() >= 4 && &bytes[0..4] == FLAC_SIGNATURE {
        parse_flac(
            bytes,
            max_text_bytes,
            max_cover_bytes,
            &mut title,
            &mut artist,
            &mut album,
            &mut cover_mime,
            &mut cover_data,
            &mut cover_type,
            &mut audio_info,
        );
    } else {
        parse_mp3(
            bytes,
            max_text_bytes,
            max_cover_bytes,
            &mut title,
            &mut artist,
            &mut album,
            &mut cover_mime,
            &mut cover_data,
            &mut cover_type,
            &mut audio_info,
        );
    }

    build_result_object(
        &title,
        &artist,
        &album,
        &cover_mime,
        &cover_data,
        &cover_type,
        &audio_info,
    )
}

#[wasm_bindgen]
pub fn parse_metadata_batch(
    buffers: Array,
    max_text_bytes: usize,
    max_cover_bytes: usize,
) -> Array {
    let out = Array::new();
    let len = buffers.length();
    for i in 0..len {
        let value = buffers.get(i);
        if let Some(u8a) = value.dyn_ref::<Uint8Array>() {
            let mut vec = vec![0u8; u8a.length() as usize];
            u8a.copy_to(&mut vec[..]);
            let meta = parse_metadata_with_limits(&vec, max_text_bytes, max_cover_bytes);
            out.push(&meta);
        } else {
            out.push(&JsValue::NULL);
        }
    }
    out
}

fn build_result_object(
    title: &Option<String>,
    artist: &Option<String>,
    album: &Option<String>,
    cover_mime: &Option<String>,
    cover_data: &Option<Vec<u8>>,
    cover_type: &Option<u8>,
    audio_info: &AudioInfo,
) -> JsValue {
    let obj = Object::new();
    if let Some(value) = title {
        set_prop(&obj, "title", &JsValue::from_str(value));
    }
    if let Some(value) = artist {
        set_prop(&obj, "artist", &JsValue::from_str(value));
    }
    if let Some(value) = album {
        set_prop(&obj, "album", &JsValue::from_str(value));
    }
    if let Some(value) = cover_mime {
        set_prop(&obj, "coverMime", &JsValue::from_str(value));
    }
    if let Some(value) = cover_data {
        let array = Uint8Array::from(value.as_slice());
        set_prop(&obj, "coverData", &array.into());
    }
    if let Some(value) = cover_type {
        set_prop(&obj, "coverType", &JsValue::from_f64(*value as f64));
    }
    if let Some(sr) = audio_info.sample_rate {
        set_prop(&obj, "sampleRate", &JsValue::from_f64(sr as f64));
    }
    if let Some(bd) = audio_info.bit_depth {
        set_prop(&obj, "bitDepth", &JsValue::from_f64(bd as f64));
    }
    if let Some(br) = audio_info.bitrate {
        set_prop(&obj, "bitrate", &JsValue::from_f64(br as f64));
    }
    if let Some(ch) = audio_info.channels {
        set_prop(&obj, "channels", &JsValue::from_f64(ch as f64));
    }
    obj.into()
}

fn set_prop(obj: &Object, key: &str, value: &JsValue) {
    let _ = js_sys::Reflect::set(obj, &JsValue::from_str(key), value);
}

// ---------------------------------------------------------------------------
// MP3 / ID3
// ---------------------------------------------------------------------------

fn parse_mp3(
    bytes: &[u8],
    max_text_bytes: usize,
    max_cover_bytes: usize,
    title: &mut Option<String>,
    artist: &mut Option<String>,
    album: &mut Option<String>,
    cover_mime: &mut Option<String>,
    cover_data: &mut Option<Vec<u8>>,
    cover_type: &mut Option<u8>,
    audio_info: &mut AudioInfo,
) {
    let mut mpeg_scan_start: usize = 0;

    if bytes.len() >= ID3V2_HEADER_SIZE && &bytes[0..3] == b"ID3" {
        let tag_size = synchsafe_to_u32(&bytes[6..10]) as usize;
        mpeg_scan_start = ID3V2_HEADER_SIZE + tag_size;

        parse_id3v2(
            bytes,
            max_text_bytes,
            max_cover_bytes,
            title,
            artist,
            album,
            cover_mime,
            cover_data,
            cover_type,
        );
    }

    // Essayer de trouver le premier en-tête de trame MPEG pour le taux d'échantillonnage / débit / canaux
    parse_mpeg_frame_header(bytes, mpeg_scan_start, audio_info);

    if (title.is_none() || artist.is_none() || album.is_none()) && bytes.len() >= ID3V1_SIZE {
        parse_id3v1(bytes, title, artist, album);
    }
}

/// Rechercher une trame de synchronisation audio MPEG valide à partir de `start`.
/// Extrait sample_rate, bitrate (kbps), bit_depth (toujours 16 pour MP3), channels.
fn parse_mpeg_frame_header(bytes: &[u8], start: usize, audio_info: &mut AudioInfo) {
    if audio_info.sample_rate.is_some() {
        return;
    }

    let end = bytes.len().saturating_sub(3);
    let mut i = start;

    // Limiter la recherche à 8 Ko à partir du début pour éviter de scanner des fichiers énormes
    let scan_limit = (start + 8192).min(end);

    while i < scan_limit {
        // Rechercher le mot de synchronisation: 11 bits à 1 = 0xFF suivi d'un octet avec les 3 bits supérieurs à 1
        if bytes[i] != 0xFF || (bytes[i + 1] & 0xE0) != 0xE0 {
            i += 1;
            continue;
        }

        let b1 = bytes[i + 1];
        let b2 = bytes[i + 2];
        let b3 = bytes[i + 3];

        let version_idx = ((b1 >> 3) & 0x03) as usize;
        let layer_idx = ((b1 >> 1) & 0x03) as usize;
        let bitrate_idx = ((b2 >> 4) & 0x0F) as usize;
        let sr_idx = ((b2 >> 2) & 0x03) as usize;
        let channel_mode = (b3 >> 6) & 0x03;

        // Valider: version != réservé(1), layer != réservé(0), sr != réservé(3), bitrate != libre(0) ou invalide(15)
        if version_idx == 1
            || layer_idx == 0
            || sr_idx == 3
            || bitrate_idx == 0
            || bitrate_idx == 15
        {
            i += 1;
            continue;
        }

        let sample_rate = MPEG_SAMPLE_RATES[version_idx][sr_idx];
        if sample_rate == 0 {
            i += 1;
            continue;
        }

        // Déterminer l'index de la table de débit binaire
        let is_v1 = version_idx == 3;
        let bitrate_table_idx = match (is_v1, layer_idx) {
            (true, 3) => 0,  // V1, Layer I
            (true, 2) => 1,  // V1, Layer II
            (true, 1) => 2,  // V1, Layer III
            (false, 3) => 3, // V2/V2.5, Layer I
            (false, _) => 4, // V2/V2.5, Layer II & III
            _ => {
                i += 1;
                continue;
            }
        };

        let bitrate_kbps = MPEG_BITRATES[bitrate_table_idx][bitrate_idx] as u32;

        let channels = if channel_mode == 3 { 1u8 } else { 2u8 };

        audio_info.sample_rate = Some(sample_rate);
        audio_info.bit_depth = Some(16); // L'audio MP3 décodé est toujours en PCM 16 bits
        audio_info.bitrate = Some(bitrate_kbps);
        audio_info.channels = Some(channels);
        return;
    }
}

fn parse_id3v2(
    bytes: &[u8],
    max_text_bytes: usize,
    max_cover_bytes: usize,
    title: &mut Option<String>,
    artist: &mut Option<String>,
    album: &mut Option<String>,
    cover_mime: &mut Option<String>,
    cover_data: &mut Option<Vec<u8>>,
    cover_type: &mut Option<u8>,
) {
    if bytes.len() < ID3V2_HEADER_SIZE {
        return;
    }

    let version = bytes[3];
    let flags = bytes[5];
    let size = synchsafe_to_u32(&bytes[6..10]) as usize;

    let mut offset = ID3V2_HEADER_SIZE;
    if flags & 0x40 != 0 && bytes.len() >= offset + 4 && version >= 3 {
        let ext_size = if version == 4 {
            synchsafe_to_u32(&bytes[offset..offset + 4]) as usize
        } else {
            be_u32(&bytes[offset..offset + 4]) as usize
        };
        offset = offset.saturating_add(ext_size);
    }

    let end = offset.saturating_add(size);
    let end = end.min(bytes.len());

    while offset < end {
        if version == 2 {
            if offset + 6 > end {
                break;
            }
            let frame_id = &bytes[offset..offset + 3];
            if frame_id == [0, 0, 0] {
                break;
            }
            let frame_size = ((bytes[offset + 3] as usize) << 16)
                | ((bytes[offset + 4] as usize) << 8)
                | (bytes[offset + 5] as usize);
            let frame_data_offset = offset + 6;
            if frame_size == 0 || frame_data_offset + frame_size > end {
                break;
            }
            let frame_data = &bytes[frame_data_offset..frame_data_offset + frame_size];

            match frame_id {
                b"TT2" => {
                    if title.is_none() {
                        *title = parse_id3_text_frame(frame_data, max_text_bytes);
                    }
                }
                b"TP1" => {
                    if artist.is_none() {
                        *artist = parse_id3_text_frame(frame_data, max_text_bytes);
                    }
                }
                b"TAL" => {
                    if album.is_none() {
                        *album = parse_id3_text_frame(frame_data, max_text_bytes);
                    }
                }
                b"PIC" => {
                    if let Some((mime, data, pic_type)) =
                        parse_pic_frame(frame_data, max_cover_bytes)
                    {
                        let should_replace =
                            cover_data.is_none() || (*cover_type != Some(3) && pic_type == 3);
                        if should_replace {
                            *cover_mime = Some(mime);
                            *cover_data = Some(data);
                            *cover_type = Some(pic_type);
                        }
                    }
                }
                _ => {}
            }

            offset = frame_data_offset + frame_size;
            continue;
        }

        if offset + 10 > end {
            break;
        }
        let frame_id = &bytes[offset..offset + 4];
        if frame_id == [0, 0, 0, 0] {
            break;
        }

        let frame_size = if version == 4 {
            synchsafe_to_u32(&bytes[offset + 4..offset + 8]) as usize
        } else {
            be_u32(&bytes[offset + 4..offset + 8]) as usize
        };

        let frame_flags = &bytes[offset + 8..offset + 10];
        let frame_data_offset = offset + 10;

        if frame_size == 0 || frame_data_offset + frame_size > end {
            break;
        }

        if frame_flags[1] & 0x0F != 0 {
            offset = frame_data_offset + frame_size;
            continue;
        }

        let frame_data = &bytes[frame_data_offset..frame_data_offset + frame_size];

        match frame_id {
            b"TIT2" => {
                if title.is_none() {
                    *title = parse_id3_text_frame(frame_data, max_text_bytes);
                }
            }
            b"TPE1" => {
                if artist.is_none() {
                    *artist = parse_id3_text_frame(frame_data, max_text_bytes);
                }
            }
            b"TALB" => {
                if album.is_none() {
                    *album = parse_id3_text_frame(frame_data, max_text_bytes);
                }
            }
            b"APIC" => {
                if let Some((mime, data, pic_type)) = parse_apic_frame(frame_data, max_cover_bytes)
                {
                    let should_replace =
                        cover_data.is_none() || (*cover_type != Some(3) && pic_type == 3);
                    if should_replace {
                        *cover_mime = Some(mime);
                        *cover_data = Some(data);
                        *cover_type = Some(pic_type);
                    }
                }
            }
            _ => {}
        }

        offset = frame_data_offset + frame_size;
    }
}

fn parse_id3_text_frame(frame_data: &[u8], max_text_bytes: usize) -> Option<String> {
    if frame_data.is_empty() {
        return None;
    }
    let encoding = frame_data[0];
    let text = &frame_data[1..];
    let text = if text.len() > max_text_bytes {
        &text[..max_text_bytes]
    } else {
        text
    };

    match encoding {
        0 => Some(latin1_to_string(trim_trailing_zeros(text))),
        1 => decode_utf16_with_bom(trim_trailing_zeros(text)),
        2 => decode_utf16be(trim_trailing_zeros(text)),
        3 => String::from_utf8(text.to_vec()).ok().map(trim_string),
        _ => None,
    }
}

fn parse_apic_frame(frame_data: &[u8], max_cover_bytes: usize) -> Option<(String, Vec<u8>, u8)> {
    if frame_data.len() < 4 {
        return None;
    }
    let encoding = frame_data[0];
    let mut idx = 1;

    let mime_end = find_zero(frame_data, idx)?;
    let mime = String::from_utf8_lossy(&frame_data[idx..mime_end]).to_string();
    idx = mime_end + 1;

    if idx >= frame_data.len() {
        return None;
    }

    let pic_type = frame_data[idx];
    idx += 1;

    let (_desc_end, next_idx) = if encoding == 0 || encoding == 3 {
        let end = find_zero(frame_data, idx)?;
        (end, end + 1)
    } else {
        let end = find_zero_utf16(frame_data, idx)?;
        (end, end + 2)
    };

    if next_idx > frame_data.len() {
        return None;
    }

    let img_data = &frame_data[next_idx..];
    if img_data.is_empty() || img_data.len() > max_cover_bytes {
        return None;
    }

    Some((mime, img_data.to_vec(), pic_type))
}

fn parse_id3v1(
    bytes: &[u8],
    title: &mut Option<String>,
    artist: &mut Option<String>,
    album: &mut Option<String>,
) {
    let start = bytes.len() - ID3V1_SIZE;
    if &bytes[start..start + 3] != b"TAG" {
        return;
    }
    let title_raw = &bytes[start + 3..start + 33];
    let artist_raw = &bytes[start + 33..start + 63];
    let album_raw = &bytes[start + 63..start + 93];

    if title.is_none() {
        let t = latin1_to_string(trim_trailing_zeros(title_raw));
        if !t.is_empty() {
            *title = Some(t);
        }
    }
    if artist.is_none() {
        let a = latin1_to_string(trim_trailing_zeros(artist_raw));
        if !a.is_empty() {
            *artist = Some(a);
        }
    }
    if album.is_none() {
        let al = latin1_to_string(trim_trailing_zeros(album_raw));
        if !al.is_empty() {
            *album = Some(al);
        }
    }
}

// ---------------------------------------------------------------------------
// FLAC
// ---------------------------------------------------------------------------

fn parse_flac(
    bytes: &[u8],
    max_text_bytes: usize,
    max_cover_bytes: usize,
    title: &mut Option<String>,
    artist: &mut Option<String>,
    album: &mut Option<String>,
    cover_mime: &mut Option<String>,
    cover_data: &mut Option<Vec<u8>>,
    cover_type: &mut Option<u8>,
    audio_info: &mut AudioInfo,
) {
    if bytes.len() < 4 || &bytes[0..4] != FLAC_SIGNATURE {
        return;
    }
    let mut offset = 4;
    let mut is_last = false;

    while !is_last && offset + 4 <= bytes.len() {
        let header = bytes[offset];
        is_last = header & 0x80 != 0;
        let block_type = header & 0x7F;
        let length = ((bytes[offset + 1] as usize) << 16)
            | ((bytes[offset + 2] as usize) << 8)
            | (bytes[offset + 3] as usize);
        offset += 4;

        if offset + length > bytes.len() {
            break;
        }

        let block = &bytes[offset..offset + length];

        match block_type {
            0 => parse_flac_streaminfo(block, audio_info),
            4 => parse_vorbis_comment(block, max_text_bytes, title, artist, album),
            6 => {
                if let Some((mime, data, pic_type)) = parse_flac_picture(block, max_cover_bytes) {
                    let should_replace =
                        cover_data.is_none() || (*cover_type != Some(3) && pic_type == 3);
                    if should_replace {
                        *cover_mime = Some(mime);
                        *cover_data = Some(data);
                        *cover_type = Some(pic_type);
                    }
                }
            }
            _ => {}
        }

        offset += length;
    }
}

/// Analyser le bloc STREAMINFO FLAC (34 octets).
///
/// Structure (offsets en bits):
///   0..15   : taille de bloc min
///   16..31  : taille de bloc max
///   32..55  : taille de trame min  (24 bits)
///   56..79  : taille de trame max  (24 bits)
///   80..99  : taux d'échantillonnage (20 bits)
///   100..102: canaux - 1           (3 bits)
///   103..107: bits/échantillon - 1 (5 bits)
///   108..143: échantillons totaux  (36 bits)
///   144..271: signature MD5
fn parse_flac_streaminfo(block: &[u8], audio_info: &mut AudioInfo) {
    if block.len() < 18 {
        return;
    }

    // Taux d'échantillonnage: 20 bits commençant à l'octet 10
    let sample_rate =
        ((block[10] as u32) << 12) | ((block[11] as u32) << 4) | ((block[12] as u32) >> 4);

    // Canaux: 3 bits aux bits 100..102 → octet 12 bits [3..1]
    let channels = ((block[12] >> 1) & 0x07) + 1;

    // Bits par échantillon: 5 bits aux bits 103..107
    // le bit 103 est le LSB de l'octet 12, les bits 104..107 sont les 4 bits supérieurs de l'octet 13
    let bps = (((block[12] & 0x01) as u16) << 4) | ((block[13] >> 4) as u16);
    let bit_depth = bps + 1;

    if sample_rate > 0 {
        audio_info.sample_rate = Some(sample_rate);
    }
    if bit_depth > 0 && bit_depth <= 32 {
        audio_info.bit_depth = Some(bit_depth);
    }
    if channels > 0 && channels <= 8 {
        audio_info.channels = Some(channels);
    }
}

fn parse_vorbis_comment(
    data: &[u8],
    max_text_bytes: usize,
    title: &mut Option<String>,
    artist: &mut Option<String>,
    album: &mut Option<String>,
) {
    if data.len() < 8 {
        return;
    }
    let mut offset = 0;
    let vendor_len = le_u32(&data[offset..offset + 4]) as usize;
    offset += 4 + vendor_len;
    if offset + 4 > data.len() {
        return;
    }
    let count = le_u32(&data[offset..offset + 4]) as usize;
    offset += 4;

    for _ in 0..count {
        if offset + 4 > data.len() {
            break;
        }
        let len = le_u32(&data[offset..offset + 4]) as usize;
        offset += 4;
        if offset + len > data.len() {
            break;
        }
        let entry = &data[offset..offset + len.min(max_text_bytes)];
        offset += len;

        if let Some(eq) = entry.iter().position(|&b| b == b'=') {
            let key = &entry[..eq];
            let value = &entry[eq + 1..];
            if let Ok(key_str) = std::str::from_utf8(key) {
                let value_str = std::str::from_utf8(value)
                    .ok()
                    .map(|s| trim_string(s.to_string()));
                match key_str.to_ascii_uppercase().as_str() {
                    "TITLE" => {
                        if title.is_none() {
                            if let Some(v) = value_str {
                                *title = Some(v);
                            }
                        }
                    }
                    "ARTIST" => {
                        if artist.is_none() {
                            if let Some(v) = value_str {
                                *artist = Some(v);
                            }
                        }
                    }
                    "ALBUM" => {
                        if album.is_none() {
                            if let Some(v) = value_str {
                                *album = Some(v);
                            }
                        }
                    }
                    _ => {}
                }
            }
        }
    }
}

fn parse_flac_picture(data: &[u8], max_cover_bytes: usize) -> Option<(String, Vec<u8>, u8)> {
    if data.len() < 32 {
        return None;
    }
    let mut offset = 0;
    let pic_type_raw = be_u32(&data[offset..offset + 4]);
    let pic_type = if pic_type_raw > 255 {
        0
    } else {
        pic_type_raw as u8
    };
    offset += 4;

    let mime_len = be_u32(&data[offset..offset + 4]) as usize;
    offset += 4;
    if offset + mime_len > data.len() {
        return None;
    }
    let mime = String::from_utf8_lossy(&data[offset..offset + mime_len]).to_string();
    offset += mime_len;

    let desc_len = be_u32(&data[offset..offset + 4]) as usize;
    offset += 4;
    if offset + desc_len > data.len() {
        return None;
    }
    offset += desc_len;

    // Ignorer largeur, hauteur, profondeur de couleur, couleurs utilisées (4 × 4 octets)
    offset += 4 * 4;
    if offset + 4 > data.len() {
        return None;
    }
    let pic_len = be_u32(&data[offset..offset + 4]) as usize;
    offset += 4;
    if offset + pic_len > data.len() || pic_len > max_cover_bytes {
        return None;
    }
    let img = &data[offset..offset + pic_len];
    if img.is_empty() {
        return None;
    }
    Some((mime, img.to_vec(), pic_type))
}

// ---------------------------------------------------------------------------
// Trame PIC ID3v2.2 (code de format à 3 caractères au lieu d'une chaîne MIME)
// ---------------------------------------------------------------------------

fn parse_pic_frame(frame_data: &[u8], max_cover_bytes: usize) -> Option<(String, Vec<u8>, u8)> {
    if frame_data.len() < 5 {
        return None;
    }
    let encoding = frame_data[0];
    let format = &frame_data[1..4];
    let mime = match format {
        b"PNG" => "image/png",
        b"JPG" => "image/jpeg",
        b"GIF" => "image/gif",
        _ => "image/unknown",
    }
    .to_string();

    let pic_type = frame_data[4];
    let idx = 5;

    let (_desc_end, next_idx) = if encoding == 0 || encoding == 3 {
        let end = find_zero(frame_data, idx)?;
        (end, end + 1)
    } else {
        let end = find_zero_utf16(frame_data, idx)?;
        (end, end + 2)
    };

    if next_idx > frame_data.len() {
        return None;
    }

    let img_data = &frame_data[next_idx..];
    if img_data.is_empty() || img_data.len() > max_cover_bytes {
        return None;
    }

    Some((mime, img_data.to_vec(), pic_type))
}

// ---------------------------------------------------------------------------
// Fonctions utilitaires
// ---------------------------------------------------------------------------

fn synchsafe_to_u32(bytes: &[u8]) -> u32 {
    if bytes.len() < 4 {
        return 0;
    }
    ((bytes[0] as u32) << 21)
        | ((bytes[1] as u32) << 14)
        | ((bytes[2] as u32) << 7)
        | (bytes[3] as u32)
}

fn be_u32(bytes: &[u8]) -> u32 {
    if bytes.len() < 4 {
        return 0;
    }
    ((bytes[0] as u32) << 24)
        | ((bytes[1] as u32) << 16)
        | ((bytes[2] as u32) << 8)
        | (bytes[3] as u32)
}

fn le_u32(bytes: &[u8]) -> u32 {
    if bytes.len() < 4 {
        return 0;
    }
    (bytes[0] as u32)
        | ((bytes[1] as u32) << 8)
        | ((bytes[2] as u32) << 16)
        | ((bytes[3] as u32) << 24)
}

fn find_zero(bytes: &[u8], start: usize) -> Option<usize> {
    bytes[start..]
        .iter()
        .position(|&b| b == 0)
        .map(|p| start + p)
}

fn find_zero_utf16(bytes: &[u8], start: usize) -> Option<usize> {
    let mut i = start;
    while i + 1 < bytes.len() {
        if bytes[i] == 0 && bytes[i + 1] == 0 {
            return Some(i);
        }
        i += 2;
    }
    None
}

fn latin1_to_string(bytes: &[u8]) -> String {
    bytes.iter().map(|&b| b as char).collect()
}

fn trim_trailing_zeros(bytes: &[u8]) -> &[u8] {
    let mut end = bytes.len();
    while end > 0 && (bytes[end - 1] == 0 || bytes[end - 1] == b' ') {
        end -= 1;
    }
    &bytes[..end]
}

fn trim_string(s: String) -> String {
    s.trim_matches(|c: char| c == '\0' || c.is_whitespace())
        .to_string()
}

fn decode_utf16_with_bom(bytes: &[u8]) -> Option<String> {
    if bytes.len() < 2 {
        return None;
    }
    if bytes[0] == 0xFF && bytes[1] == 0xFE {
        decode_utf16_le(&bytes[2..])
    } else if bytes[0] == 0xFE && bytes[1] == 0xFF {
        decode_utf16_be(&bytes[2..])
    } else {
        decode_utf16_le(bytes)
    }
}

fn decode_utf16_le(bytes: &[u8]) -> Option<String> {
    let mut u16s = Vec::with_capacity(bytes.len() / 2);
    let mut i = 0;
    while i + 1 < bytes.len() {
        let val = (bytes[i] as u16) | ((bytes[i + 1] as u16) << 8);
        if val == 0 {
            break;
        }
        u16s.push(val);
        i += 2;
    }
    String::from_utf16(&u16s).ok().map(trim_string)
}

fn decode_utf16_be(bytes: &[u8]) -> Option<String> {
    let mut u16s = Vec::with_capacity(bytes.len() / 2);
    let mut i = 0;
    while i + 1 < bytes.len() {
        let val = ((bytes[i] as u16) << 8) | (bytes[i + 1] as u16);
        if val == 0 {
            break;
        }
        u16s.push(val);
        i += 2;
    }
    String::from_utf16(&u16s).ok().map(trim_string)
}

fn decode_utf16be(bytes: &[u8]) -> Option<String> {
    decode_utf16_be(bytes)
}
