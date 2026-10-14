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
            appendLog("Find in Gmail: Aborted (search field is empty).")
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
                appendLog("Find in Gmail: Launched native search interface (active account search; finding emails depends on mailbox).")
            } else {
                // Fallback: try targeting Gmail main activity directly if resolve returned null
                val fallbackIntent = Intent(Intent.ACTION_SEARCH).apply {
                    setClassName(gmailPackage, "com.google.android.gm.ui.MailActivityGmail")
                    putExtra(SearchManager.QUERY, query)
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                startActivity(fallbackIntent)
                appendLog("Find in Gmail: Launched native search interface via fallback component.")
            }
        } catch (_: Exception) {
            // Sanitize: do not log raw exception message, stack trace, query text, or PII
            appendLog("Find in Gmail: Failed to launch intent (operation failed).")
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
                appendLog("Copy & Open: Opened Gmail application.")
            } else {
                appendLog("Copy & Open: Gmail app is not installed on this device.")
            }
        } catch (_: Exception) {
            // Sanitize: no raw exception messages or PII
            appendLog("Copy & Open: Failed to open Gmail app (operation failed).")
        }
    }

    /**
     * Validates that the URL uses HTTPS with the exact host mail.google.com.
     * Rejects userinfo tricks, lookalikes, unsupported schemes, and non-standard ports.
     */
    private fun validateGmailWebUrl(rawUrl: String): Boolean {
        return try {
            val uri = Uri.parse(rawUrl)
            uri.scheme?.equals("https", ignoreCase = true) == true &&
                uri.host?.equals("mail.google.com", ignoreCase = true) == true &&
                uri.userInfo == null &&
                (uri.port == -1 || uri.port == 443)
        } catch (_: Exception) {
            false
        }
    }

    /**
     * Action 3: Open Gmail Web Link
     * Tests a web URL explicitly entered by the user.
     * Accepts ONLY HTTPS URLs with the exact host mail.google.com.
     */
    private fun handleOpenWebLink() {
        val rawUrl = etWebUrl.text.toString().trim()
        if (rawUrl.isEmpty()) {
            appendLog("Web link: Aborted (URL field is empty).")
            return
        }

        if (!validateGmailWebUrl(rawUrl)) {
            appendLog("Web link: Rejected (URL must be HTTPS with exact host mail.google.com; userinfo, lookalikes and other schemes rejected).")
            return
        }

        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(rawUrl)).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }

            if (intent.resolveActivity(packageManager) != null) {
                startActivity(intent)
                appendLog("Web link: Launched browser for verified mail.google.com URL.")
            } else {
                appendLog("Web link: No browser application found on this device.")
            }
        } catch (_: Exception) {
            // Sanitize: no URL, exception message, or PII
            appendLog("Web link: Failed to launch browser (operation failed).")
        }
    }

    /**
     * Verifies that the PoC is running in its own isolated Linux sandbox
     * and confirms it has NO read or write access to the production Travel Organizer specific directory path.
     */
    private fun logDiagnosticsOnStart() {
        val isGmailInstalled = packageManager.getLaunchIntentForPackage(gmailPackage) != null

        // Check isolation against production app's specific directory path (not a general security audit)
        val prodDataDir = File("/data/data/$productionPackage")
        val canAccessProdData = try {
            prodDataDir.exists() && (prodDataDir.canRead() || prodDataDir.list() != null)
        } catch (_: Exception) {
            false
        }

        appendLog("Initialized isolated PoC:")
        appendLog(" • Package ID: $packageName")
        appendLog(" • Gmail installed: $isGmailInstalled")
        appendLog(" • Specific path check (/data/data/$productionPackage): ${if (canAccessProdData) "ACCESSIBLE (UNEXPECTED)" else "BLOCKED (expected Linux sandbox isolation)"}")
        appendLog(" • Note: search interface confirmed on emulator; actual email finding and multi-account switching remain unverified on this device.")
    }

    private fun appendLog(message: String) {
        val time = SimpleDateFormat("HH:mm:ss", Locale.US).format(Date())
        logHistory.append("[$time] ").append(message).append("\n")
        tvStatusLog.text = logHistory.toString().trim()
    }
}

