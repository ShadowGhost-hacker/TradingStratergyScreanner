"""
auth.py - Authentication and User Session Management

Provides secure registration, email OTP verification, login,
password reset with OTP, and session management.
"""

import hashlib
import hmac
import secrets
import time
import re
from typing import Optional, Dict, Any, Tuple

import db
import email_service


def _hash_password(password: str, salt: Optional[str] = None) -> Tuple[str, str]:
    """Hash password using PBKDF2-HMAC-SHA256 with cryptographic salt."""
    if not salt:
        salt = secrets.token_hex(16)
    hashed = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 200000).hex()
    return hashed, salt


def _verify_password(password: str, stored_hash: str, salt: str) -> bool:
    """Verify password against stored PBKDF2 hash."""
    test_hash, _ = _hash_password(password, salt)
    return hmac.compare_digest(test_hash, stored_hash)


def _is_valid_email(email: str) -> bool:
    """Check basic email validity."""
    pattern = r"^[\w\.-]+@[\w\.-]+\.\w+$"
    return bool(re.match(pattern, email.strip()))


# ============================================================================
# Registration & Verification Flows
# ============================================================================

def register_user(username: str, email: str, password: str) -> Dict[str, Any]:
    """
    Register a new user and dispatch email verification OTP.
    """
    username = username.strip()
    email = email.strip().lower()

    if len(username) < 3:
        return {"success": False, "error": "Username must be at least 3 characters"}
    if not re.match(r"^[a-zA-Z0-9_]+$", username):
        return {"success": False, "error": "Username can only contain letters, numbers, and underscores"}
    if not _is_valid_email(email):
        return {"success": False, "error": "Please provide a valid email address"}
    if len(password) < 6:
        return {"success": False, "error": "Password must be at least 6 characters"}

    # Check for existing user
    if db.get_user_by_email(email):
        return {"success": False, "error": "An account with this email already exists"}
    if db.get_user_by_username(username):
        return {"success": False, "error": "This username is already taken"}

    # Generate OTP (10 minute expiry)
    otp = email_service.generate_otp(6)
    expiry = time.time() + 600

    password_hash, salt = _hash_password(password)

    user_id = db.create_user(username, email, password_hash, salt, otp, expiry)
    if not user_id:
        return {"success": False, "error": "Failed to create user account"}

    # Dispatch email OTP
    email_res = email_service.send_otp_email(email, otp, purpose="verification")

    res = {
        "success": True,
        "message": f"Verification code sent to {email}. Please enter it to activate your account.",
        "email": email,
        "requires_otp": True
    }
    if email_res.get("mode") == "dev_preview":
        res["dev_otp"] = otp

    return res


def verify_email_otp(email: str, otp: str) -> Dict[str, Any]:
    """
    Verify user's email OTP and activate account. Automatically creates an active session.
    """
    email = email.strip().lower()
    otp = otp.strip()

    user = db.get_user_by_email(email)
    if not user:
        return {"success": False, "error": "Account not found"}

    if user["is_verified"]:
        # Already verified, generate session
        token = secrets.token_urlsafe(32)
        db.create_session(token, user["id"])
        return {
            "success": True,
            "message": "Account is already verified",
            "token": token,
            "user": {
                "id": user["id"],
                "username": user["username"],
                "email": user["email"]
            }
        }

    # Check OTP and expiration
    if not user["verification_otp"] or user["verification_otp"] != otp:
        return {"success": False, "error": "Invalid verification code"}

    if time.time() > (user["otp_expiry"] or 0):
        return {"success": False, "error": "Verification code has expired. Please request a new one."}

    # Mark as verified
    db.verify_user_email(user["id"])

    # Automatically create session
    token = secrets.token_urlsafe(32)
    db.create_session(token, user["id"])

    return {
        "success": True,
        "message": "Email verified successfully! You are now logged in.",
        "token": token,
        "user": {
            "id": user["id"],
            "username": user["username"],
            "email": user["email"]
        }
    }


def resend_verification_otp(email: str) -> Dict[str, Any]:
    """Resend email verification OTP."""
    email = email.strip().lower()
    user = db.get_user_by_email(email)
    if not user:
        return {"success": False, "error": "Account not found"}

    if user["is_verified"]:
        return {"success": False, "error": "Account is already verified. Please sign in."}

    otp = email_service.generate_otp(6)
    expiry = time.time() + 600
    db.set_verification_otp(user["id"], otp, expiry)

    email_res = email_service.send_otp_email(email, otp, purpose="verification")
    res = {
        "success": True,
        "message": f"A new verification code has been sent to {email}"
    }
    if email_res.get("mode") == "dev_preview":
        res["dev_otp"] = otp
    return res


# ============================================================================
# Login & Session Flows
# ============================================================================

def login_user(login_id: str, password: str) -> Dict[str, Any]:
    """
    Authenticate user by username or email.
    """
    login_id = login_id.strip()
    if "@" in login_id:
        user = db.get_user_by_email(login_id)
    else:
        user = db.get_user_by_username(login_id)

    if not user:
        return {"success": False, "error": "Invalid username/email or password"}

    if not _verify_password(password, user["password_hash"], user["salt"]):
        return {"success": False, "error": "Invalid username/email or password"}

    # Check email verification
    if not user["is_verified"]:
        # Resend OTP so user can verify immediately
        otp = email_service.generate_otp(6)
        expiry = time.time() + 600
        db.set_verification_otp(user["id"], otp, expiry)
        email_res = email_service.send_otp_email(user["email"], otp, purpose="verification")

        res = {
            "success": False,
            "error": "unverified_email",
            "message": "Your email is not verified. A verification code has been sent to your email.",
            "email": user["email"],
            "requires_otp": True
        }
        if email_res.get("mode") == "dev_preview":
            res["dev_otp"] = otp
        return res

    # Create active session
    token = secrets.token_urlsafe(32)
    db.create_session(token, user["id"])

    return {
        "success": True,
        "message": f"Welcome back, {user['username']}!",
        "token": token,
        "user": {
            "id": user["id"],
            "username": user["username"],
            "email": user["email"]
        }
    }


def get_current_user(token: Optional[str]) -> Optional[dict]:
    """Validate token and return current active user profile."""
    if not token:
        return None
    return db.get_session_user(token)


def logout_user(token: str) -> bool:
    """Invalidate session token."""
    if token:
        db.delete_session(token)
    return True


# ============================================================================
# Password Reset Flows
# ============================================================================

def request_password_reset(email: str) -> Dict[str, Any]:
    """
    Generate password reset OTP and dispatch via email.
    """
    email = email.strip().lower()
    user = db.get_user_by_email(email)
    if not user:
        # Don't leak whether email exists, return generic success
        return {
            "success": True,
            "message": "If an account with this email exists, a password reset code has been sent."
        }

    otp = email_service.generate_otp(6)
    expiry = time.time() + 600
    db.set_reset_otp(user["id"], otp, expiry)

    email_res = email_service.send_otp_email(email, otp, purpose="reset")

    res = {
        "success": True,
        "message": f"Password reset code sent to {email}",
        "email": email
    }
    if email_res.get("mode") == "dev_preview":
        res["dev_otp"] = otp
    return res


def reset_password_with_otp(email: str, otp: str, new_password: str) -> Dict[str, Any]:
    """
    Verify reset OTP and update password.
    """
    email = email.strip().lower()
    otp = otp.strip()

    if len(new_password) < 6:
        return {"success": False, "error": "New password must be at least 6 characters"}

    user = db.get_user_by_email(email)
    if not user:
        return {"success": False, "error": "Invalid request"}

    if not user["reset_otp"] or user["reset_otp"] != otp:
        return {"success": False, "error": "Invalid password reset code"}

    if time.time() > (user["reset_otp_expiry"] or 0):
        return {"success": False, "error": "Reset code has expired. Please request a new one."}

    # Hash and update
    new_hash, salt = _hash_password(new_password)
    db.update_password(user["id"], new_hash, salt)

    return {
        "success": True,
        "message": "Password reset successfully! You can now log in with your new password."
    }
