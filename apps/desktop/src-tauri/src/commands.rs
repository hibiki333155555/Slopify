use arboard::Clipboard;
use base64::Engine;
use base64::engine::general_purpose::STANDARD;

#[tauri::command]
pub fn get_system_idle_time() -> u64 {
    match user_idle::UserIdle::get_time() {
        Ok(idle) => idle.as_seconds(),
        Err(_) => 0,
    }
}

#[tauri::command]
pub fn read_clipboard_image() -> Option<String> {
    let mut clipboard = Clipboard::new().ok()?;
    let image = clipboard.get_image().ok()?;
    let rgba = image.bytes.into_owned();

    let mut png_data = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut png_data, image.width as u32, image.height as u32);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().ok()?;
        writer.write_image_data(&rgba).ok()?;
    }

    let b64 = STANDARD.encode(&png_data);
    Some(format!("data:image/png;base64,{}", b64))
}
