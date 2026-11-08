"""Verify the preserved first-page text of the S9 PDF and record measurable proof.

The text was extracted earlier from output/sources/S9.pdf with pypdf. This
check does not re-fetch or re-parse the PDF: it matches keywords in the
preserved text, derives the proof string from the actual matched fragments,
and records the text's SHA-256 so the report can be reproduced offline.
Re-extracting the PDF requires pypdf (and PyMuPDF for the page image).
"""
from pathlib import Path
import hashlib
import json
from datetime import datetime, timezone

root = Path(__file__).resolve().parent.parent
text_path = root / 'output' / 'sources' / 'S9-first-page.txt'
report_path = root / 'evidence' / 'source-audit.json'

text = text_path.read_text(encoding='utf-8')
upper = text.upper()
found = []
for keyword in ('BARDEEN', 'ROTATING'):
    position = upper.find(keyword)
    if position < 0:
        raise ValueError('First-page text is missing ' + keyword)
    found.append(text[position:position + len(keyword)])

proof = ('Extracted first-page text contains ' + ', '.join(found)
         + '; matched in ' + text_path.name + '.')
report = json.loads(report_path.read_text(encoding='utf-8'))
record = next(item for item in report['results'] if item['id'] == 'S9')
record['contentProof'] = proof
record['excerpt'] = text[:500]
record['contentChecked'] = True
record['proofSource'] = 'output/sources/S9-first-page.txt'
record['proofSha256'] = hashlib.sha256(text.encode('utf-8')).hexdigest()
record['verifiedAt'] = datetime.now(timezone.utc).isoformat()
record['verificationNote'] = ('Checks the preserved first-page text; re-extracting '
                              'the PDF requires pypdf and is not part of this check.')
report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(proof)
