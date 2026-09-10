import docx
from docx.shared import Pt, RGBColor, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls

docx_path = "/home/naantuam/Documents/Template_for_the_Entire_Project_updated.docx"
doc = docx.Document(docx_path)

# 1. Remove references section inside Chapter 2 (P292 to P310)
ref_ch2_start = None
for i, p in enumerate(doc.paragraphs):
    if 280 <= i <= 315 and p.text.strip() == "REFERENCES":
        ref_ch2_start = i
        break

if ref_ch2_start is not None:
    print(f"Found Chapter 2 REFERENCES at P{ref_ch2_start}")
    # Remove paragraphs until CHAPTER THREE
    while ref_ch2_start < len(doc.paragraphs) and not doc.paragraphs[ref_ch2_start].text.strip().startswith("CHAPTER THREE"):
        p_del = doc.paragraphs[ref_ch2_start]
        p_del._element.getparent().remove(p_del._element)
    print("[✓] Removed references block from Chapter 2.")

# Find end of document target paragraph (Chapter 5 end)
target_p = doc.paragraphs[-1]

def add_p(text, bold=False, italic=False, size=12, align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_after=6, hanging=False):
    p = doc.add_paragraph()
    p.alignment = align
    if space_after:
        p.paragraph_format.space_after = Pt(space_after)
    if hanging:
        p.paragraph_format.left_indent = Inches(0.5)
        p.paragraph_format.first_line_indent = Inches(-0.5)
    run = p.add_run(text)
    run.bold = bold
    run.italic = italic
    run.font.name = 'Times New Roman'
    run.font.size = Pt(size)
    run.font.color.rgb = RGBColor(0, 0, 0)
    return p

# --- 2. REFERENCES SECTION AT END OF PROJECT ---
add_p("", space_after=12)
add_p("REFERENCES", bold=True, size=14, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=12)

references_list = [
    "Abbas, S., Ojo, S., Bouazzi, I., Sampedro, G. A., Al Hejaili, A., Almadhor, A. S., & Kulhánek, R. (2024). Securing Data From Side-Channel Attacks: A Graph Neural Network-Based Approach for Smartphone-Based Side Channel Attack Detection. IEEE Access, 12, 45120-45135.",
    "Ainslie, S. (2023). Cyber-threat intelligence for security decision-making: A review and research agenda for practice. Computers & Security, 129, 103210.",
    "Android Developers. (2026a). Android Debug Bridge (adb) - Connect to a device over Wi-Fi. Google Developers Documentation. Retrieved May 22, 2026, from https://developer.android.com/tools/adb#connect-to-a-device-over-wifi",
    "Android Developers. (2026b). SensorManager API Reference. Google Developers Documentation. Retrieved May 22, 2026, from https://developer.android.com/reference/android/hardware/SensorManager",
    "Android Developers. (2026c). Log Information Disclosure Risks in Android Subsystems. Google Developers Documentation. Retrieved May 22, 2026, from https://developer.android.com/privacy-and-security/risks/log-info-disclosure",
    "Beer, P., Squarcina, M., Roth, S., & Lindorfer, M. (2025). TapTrap: Animation-Driven Tapjacking on Android. Proceedings of the 34th USENIX Security Symposium, 1845-1862.",
    "Cobilean, V., Mavikumbure, H. S., Mcbride, B. J., Vaagensmith, B., Singh, V. K., Li, R., Rieger, C., & Manic, M. (2023). A Review of Visualization Methods for Cyber-Physical Security: Smart Grid Case Study. IEEE Access, 11, 59788-59803.",
    "Hevner, A. R., March, S. T., Park, J., & Ram, S. (2004). Design science in information systems research. MIS Quarterly, 28(1), 75-105.",
    "Isabirye, N. (2025). Advanced Methodologies in Offline Malware Staging and Network Severance. International Journal of Information Security, 24(2), 112-128.",
    "Isabirye, N., & Omolere, O. (2022). Over-Privileged Applications: A Structural Flaw in Mobile Permissions. Journal of Cybersecurity Research, 14(3), 89-104.",
    "Kröger, J. L., & Raschke, P. (2019). Is My Phone Listening In? On the Feasibility and Detectability of Mobile Eavesdropping. Proceedings of the 14th International Conference on Availability, Reliability and Security (ARES '19), Article 42, 1-10.",
    "MITRE Corporation. (2024). MITRE ATT&CK® for Mobile Matrix (v14.1). MITRE Security Intelligence Knowledgebase. Retrieved June 10, 2026, from https://attack.mitre.org/matrices/mobile/",
    "Muhammad, Z., Anwar, Z., Javed, A. R., Saleem, B., Abbas, S., & Gadekallu, T. R. (2023). Smartphone Security and Privacy: A Survey on APTs, Mobile Malware, and Side-Channel Attacks. Technologies, 11(76), 1-28.",
    "Omolere, O. (2026). Detecting Advanced Persistent Threats in Disconnected Environments. SSRN Electronic Journal, 4812034.",
    "Peffers, K., Tuunanen, T., Rothenberger, M. A., & Chatterjee, S. (2007). A design science research methodology for information systems research. Journal of Management Information Systems, 24(3), 45-77.",
    "Sikder, A. K., Aksu, H., & Uluagac, A. S. (2017). 6thSense: A Context-aware Sensor-based Attack Detector for Smart Devices. Proceedings of the 26th USENIX Security Symposium, 397-414.",
    "Sikder, A. K., Petracca, G., Aksu, H., Jaeger, T., & Uluagac, A. S. (2021). A Survey on Sensor-based Threats and Attacks to Smart Devices and Applications. IEEE Communications Surveys & Tutorials, 23(2), 1125-1159.",
    "Sun, X., Chen, X., Liu, K., Wen, S., Li, L., & Grundy, J. (2021). Characterizing Sensor Leaks in Android Apps. Proceedings of the IEEE 32nd International Symposium on Software Reliability Engineering (ISSRE), 215-226.",
    "Sutter, T., Kehrer, T., Rennhard, M., Tellenbach, B., & Klein, J. (2024). Dynamic Security Analysis on Android: A Systematic Literature Review. ACM Computing Surveys, 56(4), Article 98, 1-36.",
    "Tsaqief, A., & Sutopo, W. (2025). Addressing the Observability Gap: Evaluating Security Transparency in Real-Time Systems. Journal of Industrial Engineering, 18(1), 45-58."
]

for ref in references_list:
    add_p(ref, hanging=True, space_after=6)

# --- 3. APPENDIX SECTION AT END OF PROJECT ---
add_p("", space_after=18)
add_p("APPENDIX", bold=True, size=16, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=12)

# Appendix A
add_p("APPENDIX A: System Specifications and Environment Parameters", bold=True, size=13, align=WD_ALIGN_PARAGRAPH.LEFT, space_after=6)
add_p("Table A.1 details the hardware, operating system, and network specifications of the physical mobile testbed and host analysis workstation utilized during the empirical evaluation of the hybrid sensor monitoring framework.", space_after=8)

cap_a = add_p("Table A.1: Mobile Testbed and Host Workstation Specifications", bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=4)
cap_a.runs[0].font.italic = True

table_a_data = [
    ["System Component", "Hardware / Software Parameter", "Configured Value / Specification"],
    ["Target Smartphone", "Device Model & Manufacturer", "Infinix X683 (Infinix Mobility)"],
    ["Target Smartphone", "Processor Architecture", "MediaTek Helio G70 Octa-Core (2x2.0 GHz + 6x1.7 GHz)"],
    ["Target Smartphone", "System Memory (RAM)", "4 GB LPDDR4X"],
    ["Target Smartphone", "Operating System Version", "Android 10 (Native OS, API Level 29)"],
    ["Target Smartphone", "Bridge Connection Mode", "High-Speed USB ADB (Android Debug Bridge v34.0.5)"],
    ["Host Workstation", "Processor & Memory", "Intel Core i7-10700 CPU @ 2.90 GHz, 16 GB DDR4 RAM"],
    ["Host Workstation", "Operating System", "Linux (Ubuntu 22.04 LTS x86_64)"],
    ["Edge Server Runtime", "Runtime Environment & DB", "Node.js v20.11.0, Express v4.18.2, SQLite v3.37.2"],
    ["Cloud Database", "Cloud PostgreSQL Provider", "Neon Cloud PostgreSQL v15.4 (Driver v0.8.0)"],
    ["Dashboard UI", "Frontend Framework & Build", "React v18.2.0, Vite v5.1.0, Tailwind CSS v3.4.1"],
    ["Network Protocol", "Real-Time WebSocket Broker", "ws v8.16.0 (TCP Port 4444, Broadcast Cooldown: 4.0s)"]
]

t_a = doc.add_table(rows=len(table_a_data), cols=3)
t_a.alignment = WD_TABLE_ALIGNMENT.CENTER
for r_i, row in enumerate(table_a_data):
    for c_i, val in enumerate(row):
        cell = t_a.cell(r_i, c_i)
        cell.text = val
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        for run in p.runs:
            run.font.name = 'Times New Roman'
            run.font.size = Pt(9)
            if r_i == 0:
                run.font.bold = True
                run.font.color.rgb = RGBColor(255, 255, 255)
            else:
                run.font.color.rgb = RGBColor(0, 0, 0)
        if r_i == 0:
            shd = parse_xml(r'<w:shd {} w:fill="000000"/>'.format(nsdecls('w')))
            cell._tc.get_or_add_tcPr().append(shd)

add_p("", space_after=12)

# Appendix B
add_p("APPENDIX B: Core Threat Engine Rule Matrix and Scoring Definitions", bold=True, size=13, align=WD_ALIGN_PARAGRAPH.LEFT, space_after=6)
add_p("Table B.1 presents the complete set of heuristic threat rules, scoring weights, tactical domains, and corresponding MITRE ATT&CK Mobile technique mappings implemented in the rules engine (rules.js).", space_after=8)

cap_b = add_p("Table B.1: Threat Rules Scoring Definitions and MITRE ATT&CK Mappings", bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=4)
cap_b.runs[0].font.italic = True

table_b_data = [
    ["Rule Identifier", "Tactical Domain", "Trigger Condition & Description", "Points", "MITRE ATT&CK ID"],
    ["STATE_SCREEN_OFF", "Context", "Sensor telemetry streams while physical display is powered OFF", "+30", "N/A (Covert Context)"],
    ["STATE_BACKGROUND", "Context", "Sensor accessed while app priority is in BACKGROUND state", "+25", "N/A (Context Penalty)"],
    ["COLLECTION_CAMERA", "Collection", "Hardware camera lens streaming active", "+20", "T1125 (Video Capture)"],
    ["COLLECTION_MIC", "Collection", "Acoustic microphone recording stream active", "+20", "T1123 (Audio Capture)"],
    ["DISCOVERY_GPS", "Discovery", "GPS location provider actively queried", "+15", "T1430 (Location Tracking)"],
    ["DISCOVERY_BLE", "Discovery", "Bluetooth Low Energy background scan active", "+15", "T1636.001 (Location Discovery)"],
    ["CONTEXT_BG_VIOLATION", "Context", "High-Value Target sensor accessed in background state", "+50", "N/A (Critical Violation)"],
    ["EVASION_ACCESSIBILITY", "Defense Evasion", "Non-system app operating with active Accessibility Service", "+15", "T1406 (Accessibility Abuse)"],
    ["ORIGIN_SIDELOADED", "Origin Risk", "Package installed outside Google Play Store (non-standard installer)", "+20", "T1404 (Sideloading)"],
    ["CORRELATION_AV_SYNC", "Correlation", "Camera and Microphone active simultaneously (AV capture pattern)", "+35", "T1125 / T1123"],
    ["CORRELATION_TRACK_TRIO", "Correlation", "Camera + Microphone + Location active simultaneously", "+50", "T1125 / T1123 / T1430"],
    ["TRUST_OS_INFRA", "Trust Modifier", "Verified OS infrastructure service (5 platform properties)", "-50", "Exempt (Platform Service)"],
    ["COHERENCE_MATCH", "Coherence", "Sensor access aligns with declared package category purpose", "-10", "Exempt (Coherent Access)"]
]

t_b = doc.add_table(rows=len(table_b_data), cols=5)
t_b.alignment = WD_TABLE_ALIGNMENT.CENTER
for r_i, row in enumerate(table_b_data):
    for c_i, val in enumerate(row):
        cell = t_b.cell(r_i, c_i)
        cell.text = val
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        for run in p.runs:
            run.font.name = 'Times New Roman'
            run.font.size = Pt(9)
            if r_i == 0:
                run.font.bold = True
                run.font.color.rgb = RGBColor(255, 255, 255)
            else:
                run.font.color.rgb = RGBColor(0, 0, 0)
        if r_i == 0:
            shd = parse_xml(r'<w:shd {} w:fill="000000"/>'.format(nsdecls('w')))
            cell._tc.get_or_add_tcPr().append(shd)

add_p("", space_after=12)

# Appendix C
add_p("APPENDIX C: Sample Real-Time Sensor Telemetry JSON Payloads", bold=True, size=13, align=WD_ALIGN_PARAGRAPH.LEFT, space_after=6)
add_p("The following structured JSON payloads illustrate raw telemetry packets transmitted from the mobile telemetry agent to the edge server via WebSocket (TCP Port 4444) for BENIGN and CRITICAL classifications.", space_after=8)

add_p("Sample 1: Verified Safe BENIGN Telemetry Packet (com.google.android.gms)", bold=True, size=10, align=WD_ALIGN_PARAGRAPH.LEFT, space_after=4)
json_benign = """{
  "device_id": "Infinix_X683",
  "timestamp": "2026-07-23T19:28:47.102Z",
  "metadata": {
    "app_package": "com.google.android.gms",
    "app_state": "BACKGROUND",
    "screen_state": "ON",
    "sensor_name": "Passive_Location",
    "install_source": "com.android.vending"
  },
  "payload": {
    "gps_active": true,
    "camera_active": false,
    "mic_active": false,
    "ble_scan_active": false
  },
  "evaluation": {
    "total_score": 0,
    "threat_level": "BENIGN",
    "triggered_rules": ["TRUST_OS_INFRA"],
    "modifiers_applied": ["OS_INFRA_EXEMPT: Platform-signed system service (-50 pts)"]
  }
}"""
add_p(json_benign, size=9, align=WD_ALIGN_PARAGRAPH.LEFT, space_after=10)

add_p("Sample 2: Covert Surveillance CRITICAL Telemetry Packet (com.fadcam)", bold=True, size=10, align=WD_ALIGN_PARAGRAPH.LEFT, space_after=4)
json_critical = """{
  "device_id": "Infinix_X683",
  "timestamp": "2026-07-23T19:28:47.884Z",
  "metadata": {
    "app_package": "com.fadcam",
    "app_state": "BACKGROUND",
    "screen_state": "OFF",
    "sensor_name": "Camera",
    "install_source": "com.google.android.packageinstaller"
  },
  "payload": {
    "camera_active": true,
    "mic_active": true,
    "gps_active": false,
    "accessibility_warnings": ["AccessibilityService_Active"]
  },
  "evaluation": {
    "total_score": 135,
    "threat_level": "CRITICAL",
    "triggered_rules": [
      "STATE_SCREEN_OFF", "COLLECTION_CAMERA", "CONTEXT_BG_VIOLATION",
      "EVASION_ACCESSIBILITY", "ORIGIN_SIDELOADED"
    ],
    "modifiers_applied": [
      "STATE_SCREEN_OFF (+30 pts)", "COLLECTION_CAMERA (+20 pts)",
      "CONTEXT_BG_VIOLATION (+50 pts)", "EVASION_ACCESSIBILITY (+15 pts)",
      "ORIGIN_SIDELOADED (+20 pts)"
    ]
  }
}"""
add_p(json_critical, size=9, align=WD_ALIGN_PARAGRAPH.LEFT, space_after=12)

doc.save(docx_path)
print(f"[✓] Saved References and Appendix to {docx_path}")
