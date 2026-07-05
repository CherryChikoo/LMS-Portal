import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";

export async function POST(request: NextRequest) {
  try {
    const { idToken, newEmail } = await request.json();

    if (!idToken || !newEmail) {
      return NextResponse.json(
        { error: "Missing idToken or newEmail" },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch {
      return NextResponse.json(
        { error: "Invalid or expired session. Please sign in again." },
        { status: 401 }
      );
    }

    const uid = decodedToken.uid;

    // Enforce uniqueness: ensure the new email is not already used by another account
    try {
      const existingUser = await adminAuth.getUserByEmail(newEmail);
      if (existingUser.uid !== uid) {
        return NextResponse.json(
          { error: "This email address is already associated with another account." },
          { status: 409 }
        );
      }
    } catch (err: any) {
      if (err.code !== "auth/user-not-found") {
        console.error("Admin getUserByEmail error:", err);
        return NextResponse.json(
          { error: "Could not verify email uniqueness." },
          { status: 500 }
        );
      }
    }

    // Update the user's login email directly (no verification email sent)
    await adminAuth.updateUser(uid, { email: newEmail });

    return NextResponse.json({ success: true, uid });
  } catch (error: any) {
    console.error("Admin update email error:", error);

    if (error.code === "auth/email-already-exists") {
      return NextResponse.json(
        { error: "This email address is already associated with another account." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: error.message || "Failed to update email" },
      { status: 500 }
    );
  }
}
