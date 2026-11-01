package com.sws2apps.territories

import android.Manifest
import android.content.Intent
import android.graphics.Color
import android.net.wifi.WifiManager
import android.graphics.Outline
import android.graphics.drawable.ColorDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Base64
import android.view.ActionMode
import android.view.HapticFeedbackConstants
import android.view.View
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import android.view.animation.DecelerateInterpolator
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.BackEventCompat
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.graphics.ColorUtils
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

// The Organized shell's window handling (organized-tauri-shell MainActivity):
// edge to edge under transparent bars coloured by the page, the page's accent
// on the selection handles, platform haptics, Back that closes dialogs first
// and previews leaving, and a splash held until the first frame.
class MainActivity : TauriActivity() {
  private val handler = Handler(Looper.getMainLooper())
  private var barColor: Int? = null
  private var webView: WebView? = null

  // Android drops multicast without it, and mDNS finds paired devices on the Wi-Fi
  private val multicast by lazy {
    (applicationContext.getSystemService(WIFI_SERVICE) as WifiManager)
      .createMulticastLock("territories-lan")
      .apply { setReferenceCounted(false) }
  }

  /** top, right, bottom, left in CSS pixels */
  @Volatile private var insets = listOf(0, 0, 0, 0)

  @Volatile private var pageShown = false

  override fun onCreate(savedInstanceState: Bundle?) {
    // the store opens before Tauri starts, in the files directory a
    // background sync uses too
    Native.open(filesDir.absolutePath)

    val splashStart = SystemClock.uptimeMillis()
    installSplashScreen().setKeepOnScreenCondition {
      !pageShown && SystemClock.uptimeMillis() - splashStart < SPLASH_MAX_MS
    }

    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT)
    )
    super.onCreate(savedInstanceState)
    current = this
    handleFileIntent(intent)
    handleOpenedFile(intent)

    prefs().getString(PREF_ACCENT, null)?.let(::applyAccent)

    prefs().getInt(PREF_BAR_COLOR, 0).takeIf { it != 0 }?.let { color ->
      window.setBackgroundDrawable(ColorDrawable(color))
      applyBarColor(color)
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      window.isNavigationBarContrastEnforced = false
    }

    // Android WebView doesn't fill env(safe-area-inset-*) yet, so
    // system_bars.js gets the bar sizes from here and pads the page itself
    ViewCompat.setOnApplyWindowInsetsListener(content()) { view, windowInsets ->
      val bars = windowInsets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )
      // edge to edge, adjustResize no longer shrinks the page for the keyboard;
      // the page ends above it instead, so a dialog moves up as in a native app
      val keyboard = windowInsets.getInsets(WindowInsetsCompat.Type.ime()).bottom
      view.setPadding(0, 0, 0, keyboard)
      val density = resources.displayMetrics.density
      // the keyboard covers the navigation bar, so the page keeps no room for it
      val bottom = if (keyboard > 0) 0 else bars.bottom
      insets = intArrayOf(bars.top, bars.right, bottom, bars.left)
        .map { Math.round(it / density) }
      webView?.evaluateJavascript(
        "window.__organizedInsets&&window.__organizedInsets(${insets.joinToString(",")})",
        null
      )
      WindowInsetsCompat.CONSUMED
    }
  }

  // uiMode is in configChanges, so a dark-mode switch lands here, not in a restart
  override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
    super.onConfigurationChanged(newConfig)
    val night = (newConfig.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK) ==
      android.content.res.Configuration.UI_MODE_NIGHT_YES
    webView?.evaluateJavascript(
      "window.__organizedSystemDark&&window.__organizedSystemDark($night)",
      null
    )
  }

  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
    prefs().getInt(PREF_BAR_COLOR, 0).takeIf { it != 0 }?.let { color ->
      webView.setBackgroundColor(color)
      handler.post { webView.setBackgroundColor(color) }
    }
    webView.addJavascriptInterface(ShellBridge(), "OrganizedShell")
    webView.addJavascriptInterface(HapticsBridge(), "OrganizedHaptics")
    webView.addJavascriptInterface(FilesBridge(), "OrganizedFiles")
    webView.addJavascriptInterface(NearbyBridge(), "TerritoryNearby")
    // a reload starts the page over: routes and files wait for its ready() again
    if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
      WebViewCompat.addDocumentStartJavaScript(webView, "window===top&&OrganizedShell.loading()", setOf("*"))
    }
    handler.post(::takeBackPress)
  }

  override fun onPause() {
    visible = false
    super.onPause()
  }

  // a window over the app (a permission, the shade) must not end a tap
  override fun onStart() {
    super.onStart()
    multicast.acquire()
  }

  override fun onStop() {
    multicast.release()
    Tap.stop()
    super.onStop()
  }

  override fun onDestroy() {
    if (current == this) current = null
    super.onDestroy()
  }

  override fun onNewIntent(intent: Intent) {
    // a tag found while answering a tap (Tap.swallow): nothing to do
    if (Tap.isTagIntent(intent)) return
    super.onNewIntent(intent)
    setIntent(intent)
    handleFileIntent(intent)
    handleRoute(intent)
    handleOpenedFile(intent)
  }

  /** A transfer file from a paired phone, opened or shared into the app, until the sync page takes it. */
  private var openedFile: String? = null

  /** Where a notification or shortcut leads, until the page can go there. */
  private var pendingRoute: String? = null

  private var pageReady = false

  private fun handleOpenedFile(intent: Intent?) {
    if (intent == null) return
    // a transfer shared as text rather than as a file
    val shared = if (intent.action == Intent.ACTION_SEND) intent.getStringExtra(Intent.EXTRA_TEXT)?.trim() else null
    if (shared != null && isTransfer(shared)) {
      intent.removeExtra(Intent.EXTRA_TEXT)
      openedFile = shared
      showFile()
      return
    }
    val uri = when (intent.action) {
      Intent.ACTION_VIEW -> intent.data
      Intent.ACTION_SEND ->
        androidx.core.content.IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, android.net.Uri::class.java)
      else -> null
    } ?: return
    intent.data = null
    intent.removeExtra(Intent.EXTRA_STREAM)
    Thread {
      val text = runCatching { readTransfer(uri) }.getOrNull() ?: return@Thread
      handler.post {
        openedFile = text
        showFile()
      }
    }.start()
  }

  /** Any app can hand over any file, so only up to a size a transfer can have. */
  private fun readTransfer(uri: android.net.Uri): String? {
    val text = contentResolver.openInputStream(uri)?.use { input ->
      val bytes = java.io.ByteArrayOutputStream()
      val buffer = ByteArray(64 * 1024)
      while (bytes.size() <= FILE_MAX) {
        val read = input.read(buffer)
        if (read < 0) break
        bytes.write(buffer, 0, read)
      }
      if (bytes.size() > FILE_MAX) TOO_LARGE else bytes.toString("UTF-8").trim()
    } ?: return null
    return text.takeIf { it == TOO_LARGE || isTransfer(it) }
  }

  private fun isTransfer(text: String) = listOf("OTB1:", "OTC1:", "OTA1:").any(text::startsWith)

  /** Every page takes it in; before one has loaded, it asks for the file (takeFile). */
  private fun showFile() {
    if (openedFile == null) return
    if (!pageReady || webView == null) {
      pendingRoute = "/sync"
      return
    }
    deliverFile()
  }

  private fun deliverFile() {
    val text = openedFile ?: return
    openedFile = null
    Native.emit("file", JSONObject().put("text", text).toString())
  }

  /** A reminder opens the page it is about, e.g. the sync page. */
  private fun handleRoute(intent: Intent?) {
    val route = intent?.getStringExtra(EXTRA_ROUTE) ?: return
    intent.removeExtra(EXTRA_ROUTE)
    openRoute(route)
  }

  private fun openRoute(route: String) {
    pendingRoute = route
    val view = webView ?: return
    if (!pageReady) return
    pendingRoute = null
    view.evaluateJavascript("location.hash=${JSONObject.quote("#$route")}", null)
  }

  /** Open, Share or Print pressed on a saved file's notification. */
  private fun handleFileIntent(intent: Intent?) {
    val path = intent?.getStringExtra(FileHandoff.EXTRA_PATH) ?: return
    val type = intent.getStringExtra(FileHandoff.EXTRA_TYPE) ?: "*/*"
    val what = intent.getStringExtra(FileHandoff.EXTRA_ACTION)
    intent.removeExtra(FileHandoff.EXTRA_PATH)
    // only the app's own notifications name a file; any other app could send one
    val file = runCatching { java.io.File(path).canonicalFile }.getOrNull() ?: return
    if (!FileHandoff.isShared(this, file) || !file.exists()) return
    when (what) {
      FileHandoff.SHARE -> FileHandoff.share(this, file, type)
      FileHandoff.PRINT -> FileHandoff.print(this, file)
      else -> FileHandoff.open(this, file, type)
    }
  }

  private var pageGoesBack = false

  private val backCallback = object : OnBackPressedCallback(true) {
    override fun handleOnBackStarted(backEvent: BackEventCompat) {
      if (!pageGoesBack) content().clipToOutline = true
    }

    override fun handleOnBackProgressed(backEvent: BackEventCompat) {
      if (pageGoesBack) return
      val progress = BACK_INTERPOLATOR.getInterpolation(backEvent.progress)
      scaleForBack(1f - 0.08f * progress)
    }

    override fun handleOnBackCancelled() = restoreFromBack()

    override fun handleOnBackPressed() {
      val view = webView
      if (view == null) {
        leave()
        return
      }
      view.evaluateJavascript(BACK_SCRIPT) { result ->
        if (result?.trim('"') == "exit") leave() else restoreFromBack()
      }
    }

    private fun leave() {
      moveTaskToBack(true)
      handler.postDelayed(::restoreFromBack, 300)
    }
  }

  private fun scaleForBack(scale: Float) {
    content().apply {
      scaleX = scale
      scaleY = scale
      outlineProvider = BACK_OUTLINE
    }
  }

  private fun restoreFromBack() {
    content().apply {
      animate().scaleX(1f).scaleY(1f).setDuration(180).withEndAction {
        clipToOutline = false
        outlineProvider = ViewOutlineProvider.BACKGROUND
      }.start()
    }
  }

  // Tauri adds its own back handler when its plugins load; the last one added
  // runs first, so this one is added again on top
  private fun takeBackPress() {
    backCallback.remove()
    onBackPressedDispatcher.addCallback(this, backCallback)
  }

  override fun onResume() {
    super.onResume()
    visible = true
    takeBackPress()
    handleRoute(intent)
    emitNearby()
    received?.let { text ->
      received = null
      Native.emit("qr", JSONObject().put("text", text).toString())
    }
    if (NearbyService.wantMeet) Tap.start(this)
    // opening the app is a good moment, unless syncing is left to Sync now
    if (Nearby.hasPeers() && Reminders.mode(this) != "manual") {
      NearbyService.start(this, "open", 2 * 60_000L)
    }
    Reminders.apply(this)
    Backups.catchUp(this)
    webView?.evaluateJavascript(THEME_COLOR_SCRIPT) { result ->
      parseCssColor(result?.trim('"'))?.let(::applyBarColor)
    }
  }

  private var selectionMode: ActionMode? = null

  /**
   * Drops the selection menu items that hand the text to another app (Web
   * search, Translate, Read aloud...): addresses and names stay on the phone.
   */
  override fun onActionModeStarted(mode: ActionMode) {
    super.onActionModeStarted(mode)
    selectionMode = mode
    handler.post(filterSelectionMenu)
  }

  override fun onActionModeFinished(mode: ActionMode) {
    if (mode == selectionMode) {
      selectionMode = null
      handler.removeCallbacks(filterSelectionMenu)
    }
    super.onActionModeFinished(mode)
  }

  private val filterSelectionMenu: Runnable = object : Runnable {
    override fun run() {
      val mode = selectionMode ?: return
      val menu = mode.menu
      var removed = false
      for (index in menu.size() - 1 downTo 0) {
        if (index >= menu.size()) continue
        val item = menu.getItem(index)
        val processText = item.intent?.action == Intent.ACTION_PROCESS_TEXT
        val webSearch = runCatching { resources.getResourceEntryName(item.itemId) }
          .getOrNull()?.contains("web_search") == true
        when {
          processText -> menu.removeGroup(item.groupId)
          webSearch -> menu.removeItem(item.itemId)
          else -> continue
        }
        removed = true
      }
      if (removed) mode.invalidateContentRect()
      // the web view rebuilds the menu when the selection changes, so it is
      // watched while open, only not on every frame while nothing comes back
      handler.postDelayed(this, if (removed) FRAME_MS else MENU_IDLE_MS)
    }
  }

  private fun content(): ViewGroup = findViewById(android.R.id.content)

  /** Called by system_bars.js. */
  private inner class ShellBridge {
    @JavascriptInterface
    fun insets(): String = insets.joinToString(",", "[", "]")

    @JavascriptInterface
    fun lastColor(): String {
      val color = prefs().getInt(PREF_BAR_COLOR, 0)
      return if (color == 0) "" else String.format("#%06X", color and 0xFFFFFF)
    }

    @JavascriptInterface
    fun setBack(handled: Boolean) {
      handler.post { pageGoesBack = handled }
    }

    @JavascriptInterface
    fun setColor(value: String) {
      val color = parseCssColor(value) ?: return
      handler.post { applyBarColor(color) }
    }

    @JavascriptInterface
    fun setAccent(theme: String) {
      handler.post { applyAccent(theme) }
    }

    @JavascriptInterface
    fun loading() {
      handler.post { pageReady = false }
    }

    @JavascriptInterface
    fun ready() {
      handler.post {
        pageReady = true
        pendingRoute?.let(::openRoute)
        val view = webView
        if (view == null) {
          pageShown = true
          return@post
        }
        view.postVisualStateCallback(0, object : WebView.VisualStateCallback() {
          override fun onComplete(requestId: Long) {
            pageShown = true
          }
        })
      }
    }
  }

  /** The web app's haptic intents (src/services/haptics) as Android's own effects. */
  private inner class HapticsBridge {
    @JavascriptInterface
    fun perform(intent: String): Boolean {
      if (Haptics.has(intent) && Haptics.play(this@MainActivity, intent)) return true
      val effect = HAPTIC_EFFECTS[intent] ?: return false
      handler.post { webView?.performHapticFeedback(effect) }
      return true
    }
  }

  /** Territory cards and exports; a web view drops downloads. */
  private inner class FilesBridge {
    // on the bridge's own thread: writing a large file would hold up the screen
    @JavascriptInterface
    fun save(name: String, type: String, base64: String) {
      bytes(base64)?.let { data -> FileHandoff.receive(this@MainActivity, name, type, data) }
    }

    @JavascriptInterface
    fun share(name: String, type: String, base64: String) {
      bytes(base64)?.let { data -> FileHandoff.share(this@MainActivity, name, type, data) }
    }

    private fun bytes(base64: String) =
      runCatching { Base64.decode(base64, Base64.DEFAULT) }.getOrNull()
  }

  /**
   * The sync page (territory-app/src/pages/Nearby.tsx). Answers come back as
   * "nearby" events through the Rust core.
   */
  private inner class NearbyBridge {
    @JavascriptInterface
    fun command(name: String, args: String) {
      val json = runCatching { JSONObject(args) }.getOrElse { JSONObject() }
      handler.post { nearbyCommand(name, json) }
    }
  }

  // "bluetoothOn" throws without the Bluetooth permission, and the settings open instead
  @android.annotation.SuppressLint("MissingPermission")
  private fun nearbyCommand(name: String, args: JSONObject) {
    val service = NearbyService.instance
    when (name) {
      "status" -> Unit
      "permissions" -> askPermissions(args.optString("which"))
      "exactAlarms" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        runCatching {
          startActivity(
            Intent(android.provider.Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
              .setData(android.net.Uri.parse("package:$packageName"))
          )
        }
      }
      "syncNow" -> NearbyService.start(this, "open", 2 * 60_000L)
      "changed" -> NearbyService.changed(this)
      "battery" -> askBattery()
      "meetStart" -> {
        Tap.start(this)
        NearbyService.wantMeet = true
        if (service != null) service.startMeet() else NearbyService.start(this, "meet", 60_000L)
      }
      "meetStop" -> {
        Tap.stop()
        NearbyService.wantMeet = false
        service?.stopMeet()
      }
      "pair" -> service?.pair(args.optString("address"))
      "confirm" -> service?.confirm(args.optString("address"), args.optBoolean("accept"))
      "schedule" -> Reminders.saveSchedule(this, args.toString())
      "hallHere" -> hallHere(args.optDouble("radius", 150.0).toFloat())
      "paired" -> Reminders.apply(this)
      "scanQr" -> startActivity(Intent(this, ScanActivity::class.java))
      "bluetoothOn" -> runCatching {
        startActivity(Intent(android.bluetooth.BluetoothAdapter.ACTION_REQUEST_ENABLE))
      }.onFailure {
        runCatching { startActivity(Intent(android.provider.Settings.ACTION_BLUETOOTH_SETTINGS)) }
      }
      "nfcSettings" -> runCatching { startActivity(Intent(android.provider.Settings.ACTION_NFC_SETTINGS)) }
      "openUrl" -> args.optString("url").takeIf { it.startsWith("https://") }?.let { url ->
        runCatching { startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url))) }
      }
      "hallSet" -> {
        val lat = args.optDouble("lat")
        val lng = args.optDouble("lng")
        if (!lat.isNaN() && !lng.isNaN()) {
          Reminders.setHall(this, lat, lng, args.optDouble("radius", 150.0).toFloat())
          if (!Nearby.granted(this, Manifest.permission.ACCESS_FINE_LOCATION)) askPermissions("location")
        }
      }
      "hallClear" -> Reminders.clearHall(this)
      "takeFile" -> deliverFile()
      "backupStatus" -> Backups.emit(this)
      "backupSchedule" -> {
        Backups.setSchedule(this, args)
        Backups.emit(this)
      }
      "backupFolder" -> pickBackupFolder(false)
      "backupNow" -> if (Backups.status(this).optBoolean("folderOk")) Backups.runNow(this) else pickBackupFolder(true)
      "exportFile" -> {
        val id = args.optString("id")
        try {
          check(pendingExport == null) { "Another export is already open" }
          val bytes = android.util.Base64.decode(args.optString("base64"), android.util.Base64.DEFAULT)
          pendingExport = PendingExport(id, bytes)
          saveDocument.launch(Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = args.optString("type", "application/octet-stream")
            putExtra(Intent.EXTRA_TITLE, args.optString("name"))
          })
        } catch (error: Exception) {
          if (pendingExport?.id == id) pendingExport = null
          exportResult(id, error = error.message ?: "Cannot save the file")
        }
      }
      "shareFile" -> {
        val bytes = if (args.has("base64"))
          android.util.Base64.decode(args.optString("base64"), android.util.Base64.DEFAULT)
        else args.optString("text").toByteArray(Charsets.UTF_8)
        FileHandoff.share(this, args.optString("name"), args.optString("type", "application/octet-stream"), bytes)
      }
    }
    emitNearby()
  }

  private data class PendingExport(val id: String, val bytes: ByteArray)
  private var pendingExport: PendingExport? = null

  private fun exportResult(id: String, saved: Boolean = false, error: String? = null) {
    val result = JSONObject().put("id", id).put("saved", saved)
    if (error != null) result.put("error", error)
    Native.emit("export-result", result.toString())
  }

  private val saveDocument = registerForActivityResult(
    androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult()
  ) { result ->
    val pending = pendingExport
    pendingExport = null
    if (pending != null) {
      val uri = result.data?.data
      if (result.resultCode != android.app.Activity.RESULT_OK || uri == null) {
        exportResult(pending.id)
      } else {
        // File providers can be slow; keep the UI thread free while writing.
        Thread {
          try {
            val stream = contentResolver.openOutputStream(uri, "wt")
              ?: throw java.io.IOException("Cannot open the selected destination")
            stream.use { it.write(pending.bytes) }
            runOnUiThread { exportResult(pending.id, saved = true) }
          } catch (error: Exception) {
            runOnUiThread { exportResult(pending.id, error = error.message ?: "Cannot save the file") }
          }
        }.start()
      }
    }
  }

  private var backupAfterPick = false

  private val pickFolder = registerForActivityResult(
    androidx.activity.result.contract.ActivityResultContracts.OpenDocumentTree()
  ) { uri ->
    if (uri != null) Backups.setFolder(this, uri)
    if (uri != null && backupAfterPick) Backups.runNow(this) else Backups.emit(this)
    backupAfterPick = false
  }

  private fun pickBackupFolder(thenBackUp: Boolean) {
    backupAfterPick = thenBackUp
    runCatching { pickFolder.launch(null) }.onFailure { Backups.emit(this) }
  }

  fun emitNearby() {
    val status = NearbyService.status(this)
    val permissions = JSONObject()
      .put("bluetooth", Nearby.hasBluetooth(this))
      .put("notifications", Notify.mayNotify(this))
      .put("exactAlarms", Reminders.canExact(this))
      // a burst failed for want of them
      .put("exactAlarmsNeeded", SyncNotices.exactAlarmsNeeded(this))
      .put("location", Nearby.granted(this, Manifest.permission.ACCESS_FINE_LOCATION))
      .put(
        "bluetoothOn",
        getSystemService(android.bluetooth.BluetoothManager::class.java)?.adapter?.isEnabled == true
      )
      .put("camera", Nearby.granted(this, Manifest.permission.CAMERA))
      .put(
        "battery",
        getSystemService(android.os.PowerManager::class.java)?.isIgnoringBatteryOptimizations(packageName) == true
      )
      .put("nfc", Tap.available(this))
      .put("nfcOn", Tap.enabled(this))
      .put(
        "backgroundLocation",
        Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
          Nearby.granted(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION)
      )
    status.put("permissions", permissions)
      .put("schedule", Reminders.schedule(this))
      .put("hall", Reminders.hall(this) ?: JSONObject.NULL)
      .put("mode", Reminders.mode(this))
      .put("inside", Reminders.inside(this))
    Native.emit("nearby", status.toString())
  }

  private fun askPermissions(which: String) {
    val wanted = when (which) {
      "location" -> arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
      "camera" -> arrayOf(Manifest.permission.CAMERA)
      // one row of the welcome list: only what that row is about
      "bluetooth" -> Nearby.bluetoothPermissions()
      "notifications" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        arrayOf(Manifest.permission.POST_NOTIFICATIONS)
      } else emptyArray()
      // first start: everything at once, then the battery exception
      "all" -> {
        askBatteryAfter = true
        Nearby.bluetoothPermissions() + Manifest.permission.CAMERA +
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            arrayOf(Manifest.permission.POST_NOTIFICATIONS)
          } else emptyArray()
      }
      // asked on its own, after location, as Android requires
      "backgroundLocation" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
      } else emptyArray()
      else -> Nearby.bluetoothPermissions() +
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          arrayOf(Manifest.permission.POST_NOTIFICATIONS)
        } else emptyArray()
    }.filter { !Nearby.granted(this, it) }
    // Android shows no dialog for a permission refused twice; only its settings help then
    val asked = getSharedPreferences("permissions", MODE_PRIVATE)
    val blocked = wanted.filter { asked.getBoolean(it, false) && !shouldShowRequestPermissionRationale(it) }
    val askable = wanted - blocked.toSet()
    when {
      askable.isNotEmpty() -> {
        asked.edit().apply { askable.forEach { putBoolean(it, true) } }.apply()
        requestPermissions(askable.toTypedArray(), REQUEST_PERMISSIONS)
      }
      blocked.isNotEmpty() -> openSettings(notifications = false)
      // allowed, but switched off for this app
      (which.isEmpty() || which == "notifications") && !Notify.mayNotify(this) ->
        openSettings(notifications = true)
      askBatteryAfter -> askBattery()
    }
  }

  private fun openSettings(notifications: Boolean) {
    val intent = if (notifications && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS)
        .putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, packageName)
    } else {
      Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
        .setData(android.net.Uri.parse("package:$packageName"))
    }
    runCatching { startActivity(intent) }
  }

  private var askBatteryAfter = false

  private fun askBattery() {
    askBatteryAfter = false
    val power = getSystemService(android.os.PowerManager::class.java)
    if (power?.isIgnoringBatteryOptimizations(packageName) == true) return
    runCatching {
      startActivity(
        Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
          .setData(android.net.Uri.parse("package:$packageName"))
      )
    }
  }

  override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode != REQUEST_PERMISSIONS) return
    if (askBatteryAfter) askBattery()
    Reminders.apply(this)
    emitNearby()
  }

  @android.annotation.SuppressLint("MissingPermission")
  private fun hallHere(radius: Float) {
    if (!Nearby.granted(this, Manifest.permission.ACCESS_FINE_LOCATION)) {
      askPermissions("location")
      return
    }
    val manager = getSystemService(android.location.LocationManager::class.java) ?: return
    val use = { location: android.location.Location? ->
      if (location != null) {
        Reminders.setHall(this, location.latitude, location.longitude, radius)
      }
      emitNearby()
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val provider = listOf(
        android.location.LocationManager.GPS_PROVIDER,
        android.location.LocationManager.NETWORK_PROVIDER
      ).firstOrNull { manager.isProviderEnabled(it) } ?: return use(null)
      manager.getCurrentLocation(provider, null, mainExecutor) { use(it) }
    } else {
      @Suppress("DEPRECATION")
      use(
        manager.getLastKnownLocation(android.location.LocationManager.GPS_PROVIDER)
          ?: manager.getLastKnownLocation(android.location.LocationManager.NETWORK_PROVIDER)
      )
    }
  }

  private fun applyAccent(theme: String) {
    val style = ACCENTS[theme] ?: return
    this.theme.applyStyle(
      if (theme.endsWith("-dark")) R.style.Theme_app_Dark else R.style.Theme_app_Light,
      true
    )
    this.theme.applyStyle(style, true)
    prefs().edit().putString(PREF_ACCENT, theme).apply()
  }

  private fun prefs() = getSharedPreferences("shell", MODE_PRIVATE)

  private fun applyBarColor(color: Int) {
    if (color == barColor) return
    barColor = color

    window.setBackgroundDrawable(ColorDrawable(color))
    content().setBackgroundColor(color)

    val light = ColorUtils.calculateLuminance(color) > 0.5

    prefs().edit().putInt(PREF_BAR_COLOR, color).apply()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      splashScreen.setSplashScreenTheme(
        if (light) R.style.Theme_App_Starting_Light else R.style.Theme_App_Starting_Dark
      )
    }
    WindowCompat.getInsetsController(window, window.decorView).apply {
      isAppearanceLightStatusBars = light
      isAppearanceLightNavigationBars = light
    }
  }

  companion object {
    const val EXTRA_ROUTE = "com.sws2apps.territories.ROUTE"

    /** A code or transfer the scanner read, for the page once it is back. */
    @Volatile var received: String? = null

    /** On screen: sync results show on the page, not as notifications. */
    @Volatile var visible = false

    /** The open activity, which adds settings and permissions to sync status. */
    var current: MainActivity? = null
      private set
    private const val REQUEST_PERMISSIONS = 7002

    /**
     * Back closes the top MUI dialog, drawer or menu (Escape), else goes back
     * in the page history, else home to the dashboard; there it leaves.
     */
    private const val BACK_SCRIPT = """(function(){
      var modals=document.querySelectorAll('.MuiModal-root:not(.MuiModal-hidden)');
      if(modals.length){
        modals[modals.length-1].dispatchEvent(new KeyboardEvent('keydown',
          {key:'Escape',code:'Escape',bubbles:true,cancelable:true}));
        return 'closed';
      }
      var route=(location.hash.replace(/^#/,'')||'/').split('?')[0];
      if(route!=='/'&&route!==''){
        if(window.navigation&&navigation.canGoBack){history.back();return 'back';}
        location.hash='#/';
        return 'home';
      }
      return 'exit';
    })()"""

    private val BACK_INTERPOLATOR = DecelerateInterpolator()

    private val BACK_OUTLINE = object : ViewOutlineProvider() {
      override fun getOutline(view: View, outline: Outline) {
        val radius = 28 * view.resources.displayMetrics.density
        outline.setRoundRect(0, 0, view.width, view.height, radius)
      }
    }

    private const val SPLASH_MAX_MS = 5000L
    private const val FILE_MAX = 32 * 1024 * 1024
    /** What the sync page gets instead of a larger file, as on iOS (src-tauri/src/lib.rs). */
    private const val TOO_LARGE = "OTX1:too-large"
    const val FRAME_MS = 16L
    private const val MENU_IDLE_MS = 100L
    const val PREF_BAR_COLOR = "bar_color"
    const val PREF_ACCENT = "accent"

    val ACCENTS = mapOf(
      "blue-light" to R.style.Accent_blue_light,
      "blue-dark" to R.style.Accent_blue_dark,
      "green-light" to R.style.Accent_green_light,
      "green-dark" to R.style.Accent_green_dark,
      "purple-light" to R.style.Accent_purple_light,
      "purple-dark" to R.style.Accent_purple_dark,
      "orange-light" to R.style.Accent_orange_light,
      "orange-dark" to R.style.Accent_orange_dark,
      "teal-light" to R.style.Accent_teal_light,
      "teal-dark" to R.style.Accent_teal_dark,
      "rose-light" to R.style.Accent_rose_light,
      "rose-dark" to R.style.Accent_rose_dark,
      "slate-light" to R.style.Accent_slate_light,
      "slate-dark" to R.style.Accent_slate_dark,
    )

    val HAPTIC_EFFECTS: Map<String, Int> = buildMap {
      val api30 = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
      val api34 = Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE

      put("tap", HapticFeedbackConstants.KEYBOARD_TAP)
      put(
        "tick",
        if (api34) HapticFeedbackConstants.SEGMENT_FREQUENT_TICK else HapticFeedbackConstants.CLOCK_TICK
      )
      put(
        "toggleOn",
        if (api34) HapticFeedbackConstants.TOGGLE_ON else HapticFeedbackConstants.CLOCK_TICK
      )
      put(
        "toggleOff",
        if (api34) HapticFeedbackConstants.TOGGLE_OFF else HapticFeedbackConstants.CLOCK_TICK
      )
      put(
        "confirm",
        if (api30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY
      )
      put("reject", if (api30) HapticFeedbackConstants.REJECT else HapticFeedbackConstants.LONG_PRESS)
    }

    const val THEME_COLOR_SCRIPT =
      "(function(){var m=document.querySelector('meta[name=\"theme-color\"]');" +
        "return (m&&m.content)||getComputedStyle(document.body||document.documentElement).backgroundColor;})()"

    private val RGB = Regex("""rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)""")

    fun parseCssColor(raw: String?): Int? {
      val value = raw?.trim()
      if (value.isNullOrEmpty()) return null

      RGB.find(value)?.let { match ->
        val (r, g, b) = match.destructured
        return Color.rgb(r.toInt(), g.toInt(), b.toInt())
      }

      val hex = value.removePrefix("#")
      return runCatching {
        when (hex.length) {
          3 -> Color.parseColor("#" + hex.map { "$it$it" }.joinToString(""))
          6 -> Color.parseColor("#$hex")
          8 -> Color.parseColor("#" + hex.substring(0, 6))
          else -> null
        }
      }.getOrNull()
    }
  }
}
