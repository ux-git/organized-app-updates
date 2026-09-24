fn main() {
    // no commands: the page talks to Swift through a script message handler
    tauri_plugin::Builder::new(&[]).ios_path("ios").build();
}
