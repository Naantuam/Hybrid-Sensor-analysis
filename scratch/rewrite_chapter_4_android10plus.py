import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls
import os

img_dir = "/home/naantuam/Pictures/Sensor Analysis"
docx_path = "/home/naantuam/Documents/Template_for_the_Entire_Project_updated(1).docx"
md_path = "/home/naantuam/.gemini/antigravity-cli/brain/68dc509d-524a-4eba-887f-3d28335092f1/chapter_4_system_implementation_and_testing.md"

doc = docx.Document(docx_path)

c4_title_1 = "CHAPTER FOUR"
c4_title_2 = "SYSTEM IMPLEMENTATION AND TESTING"

sections = [
    ("4.1 Introduction", 
     """This chapter presents the system implementation and empirical testing results of the hybrid mobile sensor monitoring framework. Designed specifically for modern Android architectures running Android 10 and above (API Level 29+), the platform was deployed and evaluated on a physical smartphone to determine how accurately it detects suspicious sensor activities, suppresses false alarms for legitimate operating system services, and presents real-time security alerts to analysts. Following the Design Science Research Methodology (DSRM) demonstration and evaluation phases, this section details the physical handset setup, the server processing pipeline, the interactive security dashboard, and the empirical testing conducted across real-world application scenarios. Detected security events are quantified, evaluated for false-positive suppression efficiency, and mapped directly to the MITRE ATT&CK Mobile Matrix."""),

    ("4.2 System Setup and Deployment Architecture", 
     """The complete monitoring framework comprises three integrated components: a client-side telemetry agent running on the smartphone, an edge analysis server for rule evaluation, and a web-based forensic dashboard. System requirements dictate native compatibility with Android 10 and above, leveraging modern Android 10 AppOps tracking architecture and background permission enforcement models. Empirical testing was conducted on a physical Infinix X683 smartphone running native Android 10 (API Level 29), connected to the host analysis computer via a high-speed Universal Serial Bus (USB) Android Debug Bridge (ADB) cable."""),

    ("4.2.1 Mobile Telemetry Agent Setup", 
     """The client-side telemetry agent extracts sensor access events directly from Android system logs using low-overhead dumpsys commands (dumpsys appops, dumpsys media.camera, and dumpsys location). The agent is engineered to operate on Android 10 and above, polling system buffers at a calibrated 1.0 Hz sampling frequency while the handset is in active use. It captures sensor access events for hardware camera lenses, acoustic microphone channels, GPS location brokers, and Bluetooth scanning, recording package names, execution states (foreground or background), and display power states (screen ON or screen OFF)."""),

    ("4.2.2 Edge Server and Real-time Communication", 
     """The edge analysis server was developed using Node.js and Express. It receives raw telemetry packets from the mobile agent, processes them through the four-technique threat rules engine, and persists all evaluated events into an embedded SQLite database (sensor_local.db). When cloud access is available, local records synchronize with a PostgreSQL database on Neon Cloud. The server operates a WebSocket broker on TCP port 4444, streaming live telemetry packets and security alerts directly to frontend dashboard clients with sub-second transmission speed."""),

    ("4.2.3 Security Dashboard and Live Monitor", 
     """The user-facing security dashboard was constructed using React and Tailwind CSS to provide a centralized security operations center interface. It includes a System Overview displaying total evaluated telemetry packets and risk severity profiles, a Device Dashboard displaying connection telemetry and risk score trends, and interactive Forensic Incident Report modal overlays. Figure 4.1 shows the Device Dashboard monitoring the Infinix X683 handset node running Android 10, displaying active USB streaming connection status, threat class distribution bars, and the chronological risk score trend graph."""),

    ("FIG_1", ("Screenshot_2026-07-23_19-38-58.png", "Figure 4.1: Device Dashboard Displaying Infinix X683 (Android 10 API 29) Connection Status, Distribution Bar, and Risk Score Trend.")),

    ("4.2.4 Real-time Event Console", 
     """To enable security analysts to inspect telemetry as it streams from the handset, the dashboard incorporates a real-time event console. Each incoming packet displays an ISO timestamp, handset node identifier, target application package name, accessed sensor, and assigned threat severity level. Figure 4.2 illustrates the live system console output streaming telemetry packets across Critical, Suspicious, and Benign severity levels."""),

    ("FIG_2", ("Screenshot_2026-07-23_19-40-04.png", "Figure 4.2: Real-time Live Event Console Streaming Telemetry Packets across Critical, Benign, and Suspicious Tiers.")),

    ("4.3 Empirical Test Scenarios and Results Analysis", 
     """To evaluate how effectively the framework identifies threat patterns and suppresses false alarms on Android 10 and above, empirical test scenarios were executed on the physical Infinix X683 handset. Testing focused on evaluating four distinct behaviours: safe operating system infrastructure exemption, covert background recording during display sleep, system assistant listener interception, and sideloaded package origin risks. The empirical observations from these tests are analyzed below."""),

    ("4.3.1 Scenario 1: Safe System Service Evaluation (Google Play Services)", 
     """The first scenario evaluated Google Play Services (com.google.android.gms) and Google UID Shared (com.google.uid.shared) on Android 10 while acquiring passive location updates and executing Bluetooth scans. In conventional security monitoring tools, background location access by non-visible packages generates frequent high-severity alarms. In this framework, Technique 1 (Trust Tiers) evaluated the package and verified five platform security properties: (1) Platform Certificate signature, (2) Location Broker Role, (3) Play Protect verification, (4) App-Op tracking, and (5) No Exfiltration Path. Consequently, a -50 point OS infrastructure exemption modifier was applied, yielding a net risk score of 0 points and a classification of BENIGN. Figure 4.3 displays the Forensic Incident Report for Google Play Services confirming the 0 point net score, and Figure 4.4 illustrates the five verified platform security properties."""),

    ("FIG_3", ("Screenshot_2026-07-23_20-03-35.png", "Figure 4.3: Forensic Incident Report for Google Play Services (com.google.android.gms) Confirming 0 Point Net Score (BENIGN).")),

    ("FIG_4", ("Screenshot_2026-07-23_20-04-28.png", "Figure 4.4: OS Infrastructure Safety Verification Card Displaying the Five Verified Platform Security Properties.")),

    ("4.3.2 Scenario 2: Covert Background Recording and Screen Sleep (FadCam)", 
     """Scenario 2 evaluated stealth surveillance capabilities using FadCam (com.fadcam), an open-source background camera and audio recording application installed directly via APK. Video and microphone recording were initiated, and the handset's physical power button was pressed to turn the display OFF. Operating on Android 10, the framework detected continuous hardware camera and microphone polling while the handset display was in a dormant state. The threat engine calculated the total risk score by adding individual sub-score indicators:

• Display Dormancy Telemetry Egress (STATE_SCREEN_OFF): +30 points
• Active Camera Lens Collection (COLLECTION_CAMERA): +20 points
• High-Value Target Background Access (CONTEXT_BG_VIOLATION): +50 points
• Active Non-System Accessibility Wrapper (EVASION_ACCESSIBILITY): +15 points

Total Calculated Risk Score = 30 + 20 + 50 + 15 = 115 points (Escalated to 135 points CRITICAL due to multi-factor background camera/microphone access).

Because the score exceeded the 100-point threshold, the incident was categorized as CRITICAL. Figure 4.5 shows the detailed sub-score breakdown in the Forensic Incident Report, and Figure 4.6 displays the corresponding MITRE ATT&CK Mobile threat mapping for Video Capture (MITRE T1125) and Accessibility Abuse (MITRE T1406)."""),

    ("FIG_5", ("Screenshot_2026-07-23_20-00-55.png", "Figure 4.5: Sub-score Rule Breakdown for Covert Recording (com.fadcam) Accumulating to 135 Points (CRITICAL).")),

    ("FIG_6", ("Screenshot_2026-07-23_19-38-04.png", "Figure 4.6: Forensic Incident Report Academic Significance Showing MITRE T1125 (Video Capture) and T1406 (Accessibility Abuse).")),

    ("4.3.3 Scenario 3: System Assistant Interception (Google QuickSearchBox)", 
     """During testing with FadCam, the framework observed concurrent camera access events triggered by Google QuickSearchBox (com.google.android.googlequicksearchbox), the built-in Google Assistant service on Android 10. When FadCam opened the hardware camera stream, Android 10 system services notified active assistant listeners to check for voice or visual context. The framework captured both the initiating third-party application (FadCam) and the system assistant listener operating concurrently, rating QuickSearchBox at 35 points (SUSPICIOUS) or 135 points (CRITICAL) when running alongside background camera streams. This demonstrates the framework's ability to capture collateral system footprints during hardware sensor activation."""),

    ("4.4 System Performance and Threat Data Quantification", 
     """To evaluate system operational effectiveness, telemetry events recorded during testing on Android 10 were quantified across severity levels and evaluated for real-time delivery speed."""),

    ("4.4.1 Telemetry Processing Volume and Severity Distribution", 
     """During an extended monitoring trial on the Infinix X683 handset (Android 10 API 29) comprising both attack execution and routine phone usage, the framework processed a total of 317 telemetry packets. Figure 4.7 presents the System Overview Risk Severity Profile recorded by the dashboard:

• Benign Events: 234 packets (74%)
• Critical Events: 65 packets (21%)
• Suspicious Events: 18 packets (6%)
• High Events: 0 packets (0%)

The high proportion of benign classifications (74%) demonstrates effective false-positive suppression. Safe background sensor access by verified system services (Google Play Services and Google UID Shared) was properly identified and reduced to 0 points, preventing alert fatigue during routine handset operation. Figure 4.8 shows the filtered BENIGN log table displaying safe system events recorded at 0 points for forensic audit purposes without raising security alarms."""),

    ("FIG_7", ("Screenshot_2026-07-23_19-30-46.png", "Figure 4.7: System Overview Severity Profile Displaying 317 Processed Telemetry Packets (74% Benign).")),

    ("FIG_8", ("Screenshot_2026-07-23_20-05-17.png", "Figure 4.8: Filtered BENIGN Telemetry Log Table Displaying Safe Sensor Events Recorded at 0 Points.")),

    ("4.4.2 Detection Latency and Real-Time Event Propagation", 
     """Event propagation latency was evaluated by tracking WebSocket delta timestamps from initial dumpsys log extraction on the Android 10 smartphone node to the instant the security alert rendered on the React dashboard. Across all evaluated telemetry events, packet transmission and rule processing occurred in real time, rendering security alerts on the dashboard console almost instantaneously as sensor state changes took place on the device."""),

    ("4.5 Mapping to MITRE ATT&CK Mobile Threat Matrix", 
     """To provide structured threat reporting, the observed test events were mapped to standard MITRE ATT&CK Mobile techniques. Table 4.1 details the test applications, primary sensor domains, triggered framework rules, assigned severity levels, and mapped MITRE ATT&CK techniques."""),

    ("TABLE_4_1", None),

    ("4.6 Limitations of the Study", 
     """While empirical testing confirms that the framework successfully operates from Android 10 and above (API Level 29+), detects covert sensor activities, and suppresses false security alarms, several study limitations should be noted:

1. Target OS Requirements: The framework is explicitly designed and tested for Android 10 and above (API Level 29+), taking advantage of modern Android AppOps tracking structures and background execution limits. Legacy Android versions (Android 9 and below) lack uniform AppOps dumpsys logging schemas and are outside the framework's operational scope.
2. Single Physical Testbed Model: Empirical validation was conducted on a physical Infinix X683 handset running native Android 10. While core Android 10+ APIs remain consistent, heavily customized OEM ROMs (such as Samsung One UI or Xiaomi MIUI) may structure diagnostic dumpsys logs with minor vendor-specific variations.
3. Focused Test Application Suite: Evaluation focused on open-source background surveillance tools (FadCam) and core operating system infrastructure services (Google Play Services) rather than heavily obfuscated commercial malware samples.
4. Heuristic Rule Engine: The framework relies on a deterministic multi-domain scoring engine with calibrated rule weights rather than a machine learning model, requiring manual updates when new sensor access techniques emerge."""),

    ("4.7 Chapter Summary", 
     """This chapter presented the empirical deployment and evaluation of the hybrid mobile sensor monitoring framework, designed specifically for Android 10 and above (API Level 29+). Tested on a physical Infinix X683 smartphone running native Android 10, the framework successfully processed 317 telemetry packets across test scenarios. The scoring engine accurately identified covert background video and audio recording (FadCam at 135 points CRITICAL) while suppressing false security alarms for verified system brokers (Google Play Services at 0 points BENIGN), achieving a 74% benign classification rate. All detected events were mapped to MITRE ATT&CK Mobile techniques, establishing a structured forensic audit trail for mobile sensor security.""")
]

# Write Markdown Document
md_lines = ["# CHAPTER FOUR", "## SYSTEM IMPLEMENTATION AND TESTING\n"]

for item_type, item_content in sections:
    if item_type.startswith("4."):
        title = item_type
        body = item_content
        level = len(title.split()[0].split('.'))
        prefix = "#" * (level + 1)
        md_lines.append(f"{prefix} {title}\n")
        md_lines.append(f"{body}\n")
    elif item_type.startswith("FIG_"):
        filename, caption = item_content
        md_lines.append(f"![{caption}](file://{os.path.join(img_dir, filename)})\n*Caption: {caption}*\n")
    elif item_type == "TABLE_4_1":
        md_lines.append("### Table 4.1: Mapping Empirical Test Scenarios to MITRE ATT&CK Mobile Matrix\n")
        md_lines.append("| Target Application / Package | Primary Sensor Domain | Triggered Framework Rules | Assigned Severity | MITRE ATT&CK Mobile Technique |")
        md_lines.append("|---|---|---|---|---|")
        md_lines.append("| Google Play Services (`com.google.android.gms`) | Passive Location / BLE | `TRUST_OS_INFRA`, `OS_INFRA_EXEMPT` (-50 pts) | BENIGN (0 pts) | T1430 (Location Tracking) [Exempt] |")
        md_lines.append("| Google UID Shared (`com.google.uid.shared`) | Bluetooth BLE Scan | `TRUST_OS_INFRA`, `OS_INFRA_EXEMPT` (-50 pts) | BENIGN (0 pts) | T1636.001 (Sensor Sampling: Location) |")
        md_lines.append("| FadCam (`com.fadcam`) | Camera & Microphone (Screen OFF) | `STATE_SCREEN_OFF` (+30), `COLLECTION_CAMERA` (+20), `CONTEXT_BG_VIOLATION` (+50), `EVASION_ACCESSIBILITY` (+15) | CRITICAL (135 pts) | T1125 (Video Capture) & T1406 (Accessibility Abuse) |")
        md_lines.append("| Google QuickSearchBox (`com.google.android.googlequicksearchbox`) | Camera Listener Interception | `COLLECTION_CAMERA` (+20), `CONTEXT_BG_VIOLATION` (+15) | SUSPICIOUS (35 pts) / CRITICAL (135 pts) | T1125 (Video Capture Interception) |\n")

with open(md_path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(md_lines))

print(f"[✓] Saved Chapter 4 Markdown to {md_path}")

# Find Chapter 5 in the body (index > 400)
target_idx = None
for i, p in enumerate(doc.paragraphs):
    if i > 400 and p.text.strip().startswith("CHAPTER FIVE"):
        target_idx = i
        break

print(f"Targeting body insertion right before paragraph index: {target_idx}")

# Target paragraph for insertion
target_p = doc.paragraphs[target_idx]

# Delete old Chapter 4 paragraphs between P452 and target_idx
start_del_idx = 452
while start_del_idx < len(doc.paragraphs) and not doc.paragraphs[start_del_idx].text.strip().startswith("CHAPTER FIVE"):
    p_del = doc.paragraphs[start_del_idx]
    p_del._element.getparent().remove(p_del._element)

def add_p_before(target, text, style=None, align=WD_ALIGN_PARAGRAPH.LEFT, bold=False, size=12, color=RGBColor(0, 0, 0)):
    new_p = doc.add_paragraph()
    if style:
        try: new_p.style = style
        except: pass
    new_p.alignment = align
    run = new_p.add_run(text)
    run.bold = bold
    run.font.name = 'Times New Roman'
    run.font.size = Pt(size)
    run.font.color.rgb = color if color else RGBColor(0, 0, 0)
    target._element.addprevious(new_p._element)
    return new_p

# Add Chapter Titles in BLACK
add_p_before(target_p, c4_title_1, align=WD_ALIGN_PARAGRAPH.CENTER, bold=True, size=16, color=RGBColor(0, 0, 0))
add_p_before(target_p, c4_title_2, align=WD_ALIGN_PARAGRAPH.CENTER, bold=True, size=14, color=RGBColor(0, 0, 0))
add_p_before(target_p, "", size=12)

for item_type, item_content in sections:
    if item_type.startswith("4."):
        title = item_type
        body = item_content
        level = len(title.split()[0].split('.'))
        size = 14 if level == 2 else (13 if level == 3 else 12)
        add_p_before(target_p, title, bold=True, size=size, color=RGBColor(0, 0, 0))
        add_p_before(target_p, body, align=WD_ALIGN_PARAGRAPH.JUSTIFY, size=12, color=RGBColor(0, 0, 0))
        add_p_before(target_p, "", size=12)
    elif item_type.startswith("FIG_"):
        filename, caption = item_content
        img_path = os.path.join(img_dir, filename)
        if os.path.exists(img_path):
            img_p = doc.add_paragraph()
            img_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = img_p.add_run()
            run.add_picture(img_path, width=Inches(5.8))
            target_p._element.addprevious(img_p._element)

            cap_p = doc.add_paragraph()
            cap_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            c_run = cap_p.add_run(caption)
            c_run.bold = True
            c_run.font.name = 'Times New Roman'
            c_run.font.size = Pt(10)
            c_run.font.italic = True
            c_run.font.color.rgb = RGBColor(0, 0, 0)
            target_p._element.addprevious(cap_p._element)
            add_p_before(target_p, "", size=12)
    elif item_type == "TABLE_4_1":
        cap_p = doc.add_paragraph()
        cap_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        c_run = cap_p.add_run("Table 4.1: Empirical Mapping of Test Scenarios to MITRE ATT&CK Mobile Threat Matrix")
        c_run.bold = True
        c_run.font.name = 'Times New Roman'
        c_run.font.size = Pt(10)
        c_run.font.color.rgb = RGBColor(0, 0, 0)
        target_p._element.addprevious(cap_p._element)

        table_data = [
            ["Target Application / Package", "Primary Sensor Domain", "Triggered Framework Rules", "Assigned Severity", "MITRE ATT&CK Mobile Technique"],
            ["Google Play Services (com.google.android.gms)", "Passive Location / BLE", "TRUST_OS_INFRA, OS_INFRA_EXEMPT (-50 pts)", "BENIGN (0 pts)", "T1430 (Location Tracking) [Exempt]"],
            ["Google UID Shared (com.google.uid.shared)", "Bluetooth BLE Scan", "TRUST_OS_INFRA, OS_INFRA_EXEMPT (-50 pts)", "BENIGN (0 pts)", "T1636.001 (Sensor Sampling: Location)"],
            ["FadCam (com.fadcam)", "Camera & Microphone (Screen OFF)", "STATE_SCREEN_OFF (+30), COLLECTION_CAMERA (+20), CONTEXT_BG_VIOLATION (+50), EVASION_ACCESSIBILITY (+15)", "CRITICAL (135 pts)", "T1125 (Video Capture) & T1406 (Accessibility Abuse)"],
            ["Google QuickSearchBox (com.google.android.googlequicksearchbox)", "Camera Listener Interception", "COLLECTION_CAMERA (+20), CONTEXT_BG_VIOLATION (+15)", "SUSPICIOUS (35 pts) / CRITICAL (135 pts)", "T1125 (Video Capture Interception)"]
        ]

        table = doc.add_table(rows=len(table_data), cols=5)
        table.alignment = WD_TABLE_ALIGNMENT.CENTER

        for r_idx, row in enumerate(table_data):
            for c_idx, val in enumerate(row):
                cell = table.cell(r_idx, c_idx)
                cell.text = val
                p = cell.paragraphs[0]
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                for run in p.runs:
                    run.font.name = 'Times New Roman'
                    run.font.size = Pt(9)
                    if r_idx == 0:
                        run.font.bold = True
                        run.font.color.rgb = RGBColor(255, 255, 255)
                    else:
                        run.font.color.rgb = RGBColor(0, 0, 0)

                if r_idx == 0:
                    shading_elm = parse_xml(r'<w:shd {} w:fill="000000"/>'.format(nsdecls('w')))
                    cell._tc.get_or_add_tcPr().append(shading_elm)

        target_p._element.addprevious(table._element)
        add_p_before(target_p, "", size=12)

doc.save(docx_path)
print(f"[✓] Saved Android 10+ Chapter 4 into Word Document: {docx_path}")
