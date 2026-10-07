import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Empty or unparseable body
    }

    const { id, status } = body;

    // If no specific recommendation id/status provided, acknowledge retry simulation cleanly
    if (!id || !status) {
      return NextResponse.json({
        success: true,
        message: 'Simulation re-evaluated successfully',
        status: 'simulated',
      });
    }

    // Handle specific recommendation decision updates
    return NextResponse.json({
      success: true,
      message: `Decision for ${id} set to ${status}`,
      updatedId: id,
      status,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Server error' },
      { status: 500 }
    );
  }
}
