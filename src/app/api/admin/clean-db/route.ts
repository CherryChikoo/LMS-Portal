import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
    try {
        const exams = await prisma.exams.findMany({
            where: { id: "seed-exam-016" }
        });
        
        return NextResponse.json({ success: true, count: exams.length, exams });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
