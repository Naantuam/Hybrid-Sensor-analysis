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
     """This chapter presents the implementation and testing results of the hybrid mobile sensor monitoring framework. The system was deployed and evaluated on a physical Android handset to determine how effectively it detects suspicious sensor activity, suppresses false alarms for safe system services, and presents security alerts to users. Following the Design Science Research Methodology (DSRM) demonstration and evaluation phases, this section describes the setup of the physical handset, the server pipeline, the interactive dashboard interface, and the empirical testing conducted across real-world application scenarios. The threat alerts generated during testing are analyzed, quantified, and mapped to the MITRE ATT&CK Mobile Matrix."""),

    ("4.2 System Setup and Deployment Architecture", 
     """The complete system consists of three main components: a mobile sensor agent running on the smartphone, an edge server that analyzes sensor telemetry, and a web dashboard for security monitoring. Testing was conducted on a physical Infinix X683 smartphone running native Android 10 (API Level 29). The handset was connected to the host computer using a USB Android Debug Bridge (ADB) cable."""),

    ("4.2.1 Mobile Telemetry Agent Setup", 
     """The mobile agent extracts sensor usage data directly from Android system logs using internal dumpsys commands (dumpsys appops, dumpsys media.camera, and dumpsys location). The agent polls the system at a regular interval of 1 second while the device is in active use. It records which application package is accessing hardware sensors such as the camera, microphone, GPS location, and Bluetooth scanner, along with whether the app is running in the foreground or background and whether the screen is powered on or off."""),

    ("4.2.2 Edge Server and Real-time Communication", 
     """The edge analysis server was built using Node.js and Express. It receives raw telemetry packets from the phone, evaluates them against the threat rules engine, and saves all recorded events into a local database (SQLite). When cloud access is enabled, local events synchronize with a cloud PostgreSQL database. The server uses a WebSocket connection on port 4444 to stream live telemetry packets and security alerts directly to the dashboard interface with minimal delay."""),

    ("4.2.3 Security Dashboard and Live Monitor", 
     """The monitoring dashboard was built using React and Tailwind CSS to provide a clear, easy-to-understand control panel. It includes a System Overview showing total evaluated telemetry packets and threat distribution, a Device Dashboard displaying connection state and risk score trends, and an interactive Forensic Incident Report modal that pops up when a user clicks on any logged incident. Figure 4.1 shows the Device Dashboard monitoring the Infinix X683 handset, displaying active streaming connection status, threat class distribution bars, and chronological risk trends."""),

    ("FIG_1", ("Screenshot_2026-07-23_19-38-58.png", "Figure 4.1: Device Dashboard Displaying Infinix X683 Connection Status, Distribution Bar, and Risk Score Trend.")),

    ("4.2.4 Real-time Event Console", 
     """To allow security analysts to inspect incoming sensor events as they occur, the dashboard includes a live event console. Each incoming event displays the timestamp, device node name, package name, accessed sensor, and evaluated threat level. Figure 4.2 shows the live event console streaming telemetry packets across Critical, Suspicious, and Benign severity levels."""),

    ("FIG_2", ("Screenshot_2026-07-23_19-40-04.png", "Figure 4.2: Real-time Live Event Console Streaming Telemetry Packets across Critical, Benign, and Suspicious Tiers.")),

    ("4.3 Empirical Test Scenarios and Results Analysis", 
     """To evaluate how accurately the framework classifies sensor usage, empirical tests were carried out on the Infinix X683 handset using both safe system applications and background surveillance tools. The evaluation focused on validating four key behaviours: OS infrastructure safety exemption, normal application usage, covert background recording during screen sleep, and system assistant co-execution. The results of these test scenarios are described below."""),

    ("4.3.1 Scenario 1: Safe System Service Evaluation (Google Play Services)", 
     """The first scenario evaluated Google Play Services (com.google.android.gms) while actively using passive location and Bluetooth scanning. In many standard security monitors, background location access by non-visible packages generates high-severity alarms. In this framework, Technique 1 (Trust Tiers) evaluated the package and verified five platform security properties: (1) Platform Certificate signature, (2) Location Broker Role, (3) Play Protect status, (4) App-Op tracking, and (5) No Exfiltration Path. As a result, a -50 point OS infrastructure exemption modifier was applied, reducing the final risk score to 0 points (BENIGN). Figure 4.3 shows the Forensic Incident Report for Google Play Services confirming the 0 point score, and Figure 4.4 illustrates the five verified platform safety properties."""),

    ("FIG_3", ("Screenshot_2026-07-23_20-03-35.png", "Figure 4.3: Forensic Incident Report for Google Play Services (com.google.android.gms) Confirming 0 Point Net Score (BENIGN).")),

    ("FIG_4", ("Screenshot_2026-07-23_20-04-28.png", "Figure 4.4: OS Infrastructure Safety Verification Card Displaying the Five Verified Platform Security Properties.")),

    ("4.3.2 Scenario 2: Covert Background Recording and Screen Sleep (FadCam)", 
     """Scenario 2 evaluated covert background recording using FadCam (com.fadcam), an open-source background camera and audio recorder app installed directly via APK. Video and microphone recording were initiated, and the phone screen was immediately powered off. The framework detected continuous camera and microphone access while the display was sleeping. The threat engine calculated the total risk score by adding individual rule points:

• Screen OFF Display Dormancy Egress (STATE_SCREEN_OFF): +30 points
• Active Camera Lens Collection (COLLECTION_CAMERA): +20 points
• High-Value Target Background Access (CONTEXT_BG_VIOLATION): +50 points
• Active Non-System Accessibility Wrapper (EVASION_ACCESSIBILITY): +15 points

Total Calculated Risk Score = 30 + 20 + 50 + 15 = 115 points (Escalated to 135 points CRITICAL due to multi-factor background camera/mic access).

Because the score exceeded 100 points, the incident was categorized as CRITICAL. Figure 4.5 shows the detailed sub-score breakdown in the Forensic Incident Report, and Figure 4.6 displays the academic threat mapping for Video Capture (MITRE T1125) and Accessibility Abuse (MITRE T1406)."""),

    ("FIG_5", ("Screenshot_2026-07-23_20-00-55.png", "Figure 4.5: Sub-score Rule Breakdown for Covert Recording (com.fadcam) Accumulating to 135 Points (CRITICAL).")),

    ("FIG_6", ("Screenshot_2026-07-23_19-38-04.png", "Figure 4.6: Forensic Incident Report Academic Significance Showing MITRE T1125 (Video Capture) and T1406 (Accessibility Abuse).")),

    ("4.3.3 Scenario 3: System Assistant Interception (Google QuickSearchBox)", 
     """During testing with FadCam, the framework observed concurrent camera events triggered by Google QuickSearchBox (com.google.android.googlequicksearchbox), the built-in Google Assistant service. When FadCam opened the hardware camera stream, Android's system services notified active assistant listeners. The framework captured both the third-party binary (FadCam) and the system search box listening concurrently, rating QuickSearchBox at 35 points (SUSPICIOUS) or 135 points (CRITICAL) when running alongside background camera streams. This demonstrates the framework's ability to capture collateral system footprints during hardware activation."""),

    ("4.4 Threat Data Quantification and False Positive Suppression", 
     """During an extended 60-minute monitoring session on the Infinix X683 handset, the framework processed a total of 317 telemetry packets. Figure 4.7 shows the System Overview Risk Severity Profile recorded by the dashboard:

• Benign Events: 234 packets (74%)
• Critical Events: 65 packets (21%)
• Suspicious Events: 18 packets (6%)
• High Events: 0 packets (0%)

The high benign rate (74%) demonstrates effective false-positive suppression. Safe background sensor access by verified system services (Google Play Services and Google UID Shared) was properly identified and reduced to 0 points, preventing alert fatigue for normal device usage. Figure 4.8 shows the filtered BENIGN log view displaying safe system events recorded at 0 points for audit purposes without raising security alarms."""),

    ("FIG_7", ("Screenshot_2026-07-23_19-30-46.png", "Figure 4.7: System Overview Severity Profile Displaying 317 Processed Telemetry Packets (74% Benign).")),

    ("FIG_8", ("Screenshot_2026-07-23_20-05-17.png", "Figure 4.8: Filtered BENIGN Telemetry Log Table Displaying Safe Sensor Events Recorded at 0 Points.")),

    ("4.5 Mapping to MITRE ATT&CK Mobile Threat Matrix", 
     """To provide structured threat reporting, the observed test events were mapped to standard MITRE ATT&CK Mobile techniques. Table 4.1 details the test applications, primary sensor domains, triggered framework rules, assigned severity levels, and mapped MITRE ATT&CK techniques."""),

    ("TABLE_4_1", None),

    ("4.6 Limitations of the Study", 
     """While the empirical evaluation confirms that the framework successfully detects covert sensor activities and suppresses false alarms, several limitations should be noted:

1. Single Test Device: Empirical testing was conducted exclusively on one physical smartphone model (Infinix X683). Handsets from other manufacturers with customized OS ROMs (such as Samsung One UI or Xiaomi MIUI) may exhibit slight differences in dumpsys logging structures.
2. Android OS Version Scope: Evaluation was performed on Android 10 (API Level 29). Newer Android releases (Android 12+) include built-in status bar privacy indicators (green dots) that provide visual cues, though they do not provide automated scoring or forensic logging.
3. Focused Test Application Suite: Evaluation focused on open-source background surveillance tools (FadCam) and core system services (Google Play Services) rather than heavily obfuscated commercial malware samples.
4. Heuristic Rule Engine: The framework relies on a deterministic multi-domain scoring engine with calibrated rule weights rather than a machine learning classifier, requiring manual updates when new sensor access patterns emerge."""),

    ("4.7 Chapter Summary", 
     """This chapter presented the empirical deployment and evaluation of the hybrid mobile sensor monitoring framework on an Infinix X683 smartphone running Android 10. The framework successfully processed 317 telemetry packets across multiple test scenarios. The scoring engine accurately identified covert background video and audio recording (FadCam at 135 points CRITICAL) while suppressing false security alarms for verified system brokers (Google Play Services at 0 points BENIGN), achieving a 74% benign classification rate. All detected threats were mapped to MITRE ATT&CK Mobile techniques, establishing a clear forensic audit trail for mobile sensor security.""")
]

# Generate Markdown Document
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
        md_lines.append("| Scenario / Target App | Primary Sensor Domain | Triggered Framework Rules | Assigned Severity | MITRE ATT&CK Mobile Technique |")
        md_lines.append("|---|---|---|---|---|")
        md_lines.append("| Google Play Services (`com.google.android.gms`) | Passive Location / BLE | `TRUST_OS_INFRA`, `OS_INFRA_EXEMPT` (-50 pts) | BENIGN (0 pts) | T1430 (Location Tracking) [Exempt] |")
        md_lines.append("| Google UID Shared (`com.google.uid.shared`) | Bluetooth BLE Scan | `TRUST_OS_INFRA`, `OS_INFRA_EXEMPT` (-50 pts) | BENIGN (0 pts) | T1636.001 (Sensor Sampling: Location) |")
        md_lines.append("| FadCam (`com.fadcam`) | Camera & Microphone (Screen OFF) | `STATE_SCREEN_OFF` (+30), `COLLECTION_CAMERA` (+20), `CONTEXT_BG_VIOLATION` (+50), `EVASION_ACCESSIBILITY` (+15) | CRITICAL (135 pts) | T1125 (Video Capture) & T1406 (Accessibility Abuse) |")
        md_lines.append("| Google QuickSearchBox (`com.google.android.googlequicksearchbox`) | Camera Listener Interception | `COLLECTION_CAMERA` (+20), `CONTEXT_BG_VIOLATION` (+15) | SUSPICIOUS (35 pts) / CRITICAL (135 pts) | T1125 (Video Capture Interception) |\n")

with open(md_path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(md_lines))

print(f"[✓] Saved revised Chapter 4 Markdown to {md_path}")

# Now update Template_for_the_Entire_Project_updated(1).docx
# Find Chapter 5 in the body (index > 400)
target_idx = None
for i, p in enumerate(doc.paragraphs):
    if i > 400 and p.text.strip().startswith("CHAPTER FIVE"):
        target_idx = i
        break

print(f"Targeting body insertion right before paragraph index: {target_idx}")

# Target paragraph for insertion
target_p = doc.paragraphs[target_idx]

# Delete old Chapter 4 paragraphs between P415 and P497
start_del_idx = 415
while start_del_idx < len(doc.paragraphs) and not doc.paragraphs[start_del_idx].text.strip().startswith("CHAPTER FIVE"):
    p_del = doc.paragraphs[start_del_idx]
    p_del._element.getparent().remove(p_del._element)

def add_p_before(target, text, style=None, align=WD_ALIGN_PARAGRAPH.LEFT, bold=False, size=12, color=None):
    new_p = doc.add_paragraph()
    if style:
        try: new_p.style = style
        except: pass
    new_p.alignment = align
    run = new_p.add_run(text)
    run.bold = bold
    run.font.name = 'Times New Roman'
    run.font.size = Pt(size)
    if color:
        run.font.color.rgb = color
    target._element.addprevious(new_p._element)
    return new_p

# Add Chapter Titles
add_p_before(target_p, c4_title_1, align=WD_ALIGN_PARAGRAPH.CENTER, bold=True, size=16, color=RGBColor(0, 51, 102))
add_p_before(target_p, c4_title_2, align=WD_ALIGN_PARAGRAPH.CENTER, bold=True, size=14, color=RGBColor(0, 51, 102))
add_p_before(target_p, "", size=12)

for item_type, item_content in sections:
    if item_type.startswith("4."):
        title = item_type
        body = item_content
        level = len(title.split()[0].split('.'))
        size = 14 if level == 2 else (13 if level == 3 else 12)
        add_p_before(target_p, title, bold=True, size=size, color=RGBColor(0, 51, 102))
        add_p_before(target_p, body, align=WD_ALIGN_PARAGRAPH.JUSTIFY, size=12)
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
            c_run.font.color.rgb = RGBColor(80, 80, 80)
            target_p._element.addprevious(cap_p._element)
            add_p_before(target_p, "", size=12)
    elif item_type == "TABLE_4_1":
        cap_p = doc.add_paragraph()
        cap_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        c_run = cap_p.add_run("Table 4.1: Empirical Mapping of Test Scenarios to MITRE ATT&CK Mobile Threat Matrix")
        c_run.bold = True
        c_run.font.name = 'Times New Roman'
        c_run.font.size = Pt(10)
        c_run.font.color.rgb = RGBColor(0, 51, 102)
        target_p._element.addprevious(cap_p._element)

        table_data = [
            ["Scenario / Target App", "Primary Sensor Domain", "Triggered Framework Rules", "Assigned Severity", "MITRE ATT&CK Mobile Technique"],
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

                if r_idx == 0:
                    shading_elm = parse_xml(r'<w:shd {} w:fill="003366"/>'.format(nsdecls('w')))
                    cell._tc.get_or_add_tcPr().append(shading_elm)

        target_p._element.addprevious(table._element)
        add_p_before(target_p, "", size=12)

doc.save(docx_path)
print(f"[✓] Saved revised Chapter 4 into Word Document: {docx_path}")
