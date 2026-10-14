package com.evelinadakovska.gmailpoc

import android.app.SearchManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : AppCompatActivity() {

    private val syntheticReference = "SYNTH-7890"
    private val gmailPackage = "com.google.android.gm"
    private val productionPackage = "com.evelinadakovska.travelorganizer"

    private lateinit var etSearchQuery: EditText
    private lateinit var etWebUrl: EditText
    private lateinit var tvStatusLog: TextView
    private val logHistory = StringBuilder()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        etSearchQuery = findViewById(R.id.etSearchQuery)
        etWebUrl = findViewById(R.id.etWebUrl)
        tvStatusLog = findViewById(R.id.tvStatusLog)

        val btnFindInGmail = findViewById<Button>(R.id.btnFindInGmail)
        val btnCopyAndOpen = findViewById<Button>(R.id.btnCopyAndOpen)
        val btnOpenWebLink = findViewById<Button>(R.id.btnOpenWebLink)

        btnFindInGmail.setOnClickListener { handleFindInGmail() }
        btnCopyAndOpen.setOnClickListener { handleCopyAndOpenGmail() }
        btnOpenWebLink.setOnClickListener { handleOpenWebLink() }

        // Initial safety and isolation check
        logDiagnosticsOnStart()
    }

    /**
     * Action 1: Find in Gmail (Native Search Intent)
     * Launches ACTION_SEARCH targeting Gmail package with the query entered by the user.
     */
    private fun handleFindInGmail() {
        val query = etSearchQuery.text.toString().trim()
        if (query.isEmpty()) {
            appendLog("Find in Gmail: Aborted (query field is empty).")
            return
        }

        try {
            val intent = Intent(Intent.ACTION_SEARCH).apply {
                setPackage(gmailPackage)
                putExtra(SearchManager.QUERY, query)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }

            if (intent.resolveActivity(packageManager) != null) {
                startActivity(intent)
                appendLog("Find in Gmail: Launched ACTION_SEARCH intent targeting $gmailPackage.")
            } else {
                // Fallback: try targeting Gmail main activity directly if resolve returned null
                val fallbackIntent = Intent(Intent.ACTION_SEARCH).apply {
                    setClassName(gmailPackage, "com.google.android.gm.ui.MailActivityGmail")
                    putExtra(SearchManager.QUERY, query)
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                startActivity(fallbackIntent)
                appendLog("Find in Gmail: Launched via fallback MailActivityGmail.")
            }
        } catch (e: Exception) {
            appendLog("Find in Gmail: Failed to launch intent (${e.javaClass.simpleName}: ${e.message}).")
        }
    }

    /**
     * Action 2: Copy Reference & Open Gmail
     * Copies the synthetic reference ONLY on explicit button tap, then opens Gmail app.
     */
    private fun handleCopyAndOpenGmail() {
        try {
            // Explicit clipboard copy
            val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val clip = ClipData.newPlainText("Booking reference", syntheticReference)
            clipboard.setPrimaryClip(clip)
            appendLog("Copy & Open: Copied synthetic reference to clipboard on explicit tap.")

            // Launch Gmail app
            val launchIntent = packageManager.getLaunchIntentForPackage(gmailPackage)
            if (launchIntent != null) {
                launchIntent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
                startActivity(launchIntent)
                appendLog("Copy & Open: Launched Gmail app ($gmailPackage).")
            } else {
                appendLog("Copy & Open: Gmail app ($gmailPackage) is not installed on this device.")
            }
        } catch (e: Exception) {
            appendLog("Copy & Open: Error (${e.javaClass.simpleName}: ${e.message}).")
        }
    }

    /**
     * Action 3: Open Gmail Web Link
     * Tests a web URL explicitly entered by the user.
     */
    private fun handleOpenWebLink() {
        val rawUrl = etWebUrl.text.toString().trim()
        if (rawUrl.isEmpty()) {
            appendLog("Web link: Aborted (URL field is empty).")
            return
        }

        val url = if (!rawUrl.startsWith("http://") && !rawUrl.startsWith("https://")) {
            "https://$rawUrl"
        } else {
            rawUrl
        }

        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }

            if (intent.resolveActivity(packageManager) != null) {
                startActivity(intent)
                appendLog("Web link: Opened browser intent for web URL.")
            } else {
                appendLog("Web link: No browser application found on this device.")
            }
        } catch (e: Exception) {
            appendLog("Web link: Failed to open URL (${e.javaClass.simpleName}: ${e.message}).")
        }
    }

    /**
     * Verifies that the PoC is running in its own isolated Linux sandbox
     * and confirms it has NO read or write access to production Travel Organizer data.
     */
    private fun logDiagnosticsOnStart() {
        val time = SimpleDateFormat("HH:mm:ss", Locale.US).format(Date())
        val isGmailInstalled = packageManager.getLaunchIntentForPackage(gmailPackage) != null

        // Check isolation against production app's private sandbox
        val prodDataDir = File("/data/data/$productionPackage")
        val canAccessProdData = try {
            prodDataDir.exists() && (prodDataDir.canRead() || prodDataDir.list() != null)
        } catch (_: Exception) {
            false
        }

        appendLog("[$time] Initialized isolated PoC:")
        appendLog(" • Package ID: $packageName")
        appendLog(" • Gmail installed: $isGmailInstalled")
        appendLog(" • Prod sandbox access: ${if (canAccessProdData) "LEAK DETECTED" else "STRICTLY ISOLATED (blocked)"}")
    }

    private fun appendLog(message: String) {
        val time = SimpleDateFormat("HH:mm:ss", Locale.US).format(Date())
        logHistory.append("[$time] ").append(message).append("\n")
        tvStatusLog.text = logHistory.toString().trim()
    }
}
