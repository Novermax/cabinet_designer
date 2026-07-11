"""
In-app "Activate online" — uploads the activation file straight to the
Cabinet Designer backend (the same Apps Script web app used by the website).

Most reliable channel for international customers: no mail client needed,
works from any machine with internet. Pure standard library (no extra deps).

Wire it to a Help -> Activate menu action. After a successful upload, tell the
user the license will arrive by email once payment is verified.

Set ENDPOINT to your deployed Apps Script Web app URL (…/exec).
"""

import base64
import json
import urllib.parse
import urllib.request

ENDPOINT = "https://script.google.com/macros/s/AKfycbwBr_eCBurBgWLB67oTVHHlJxTA_fxoWdV7x9fJ0n__UrcBAefE2VWuYGLpDDEfPhsu/exec"


def send_activation(file_path: str, email: str, order: str, note: str = "", timeout: int = 30) -> bool:
    """
    POST the activation file (base64) + customer email + Stripe order number.
    Returns True on HTTP 200 with an "OK" body. Raises on network errors so the
    caller can show a friendly message.
    """
    with open(file_path, "rb") as f:
        raw = f.read()

    filename = file_path.replace("\\", "/").rsplit("/", 1)[-1]
    payload = {
        "action": "activate",
        "email": email,
        "order": order,
        "note": note,
        "filename": filename,
        "filedata": base64.b64encode(raw).decode("ascii"),
    }
    data = urllib.parse.urlencode(payload).encode("utf-8")

    req = urllib.request.Request(
        ENDPOINT,
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    # Apps Script answers 302 -> the final page returns the text body; urllib follows it.
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read().decode("utf-8", "replace").strip()
    return resp.status == 200 and body.upper().startswith("OK")


# --- Optional: minimal PySide6 dialog you can drop into the app --------------
#
# from PySide6.QtWidgets import (QDialog, QFormLayout, QLineEdit, QPushButton,
#                                QFileDialog, QMessageBox)
#
# class ActivateDialog(QDialog):
#     def __init__(self, activation_file_path, parent=None):
#         super().__init__(parent)
#         self.setWindowTitle("Activate online")
#         self._path = activation_file_path  # the .req file the app just generated
#         form = QFormLayout(self)
#         self.email = QLineEdit(); self.order = QLineEdit()
#         form.addRow("Email used at checkout:", self.email)
#         form.addRow("Stripe receipt / order #:", self.order)
#         send = QPushButton("Send activation request")
#         send.clicked.connect(self._send)
#         form.addRow(send)
#
#     def _send(self):
#         try:
#             ok = send_activation(self._path, self.email.text().strip(),
#                                  self.order.text().strip())
#         except Exception as exc:
#             QMessageBox.critical(self, "Activation",
#                 "Could not reach the server.\nCheck your internet and try again,\n"
#                 "or email the file to cabinetdesigner.global@gmail.com.\n\n%s" % exc)
#             return
#         if ok:
#             QMessageBox.information(self, "Activation",
#                 "Sent! We'll email your license once payment is verified.")
#             self.accept()
#         else:
#             QMessageBox.warning(self, "Activation",
#                 "The server did not confirm. Please try again or email us the file.")


if __name__ == "__main__":
    # quick manual test
    import sys
    if len(sys.argv) >= 4:
        ok = send_activation(sys.argv[1], sys.argv[2], sys.argv[3])
        print("OK" if ok else "FAILED")
    else:
        print("usage: python in_app_activation.py <file> <email> <order>")
