package com.rnpexpress.checker;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.view.View;

/** Result icon drawn on a canvas (no font/emoji dependency): check, cross, question mark or spinner arc. */
final class IconView extends View {
    static final int CHECK = 1, CROSS = 2, QUESTION = 3, WAIT = 4;
    private final int kind, color;
    private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path path = new Path();
    private float angle;

    IconView(Context c, int kind, int color) {
        super(c);
        this.kind = kind;
        this.color = color;
    }

    @Override protected void onDraw(Canvas cv) {
        float w = getWidth(), h = getHeight(), s = Math.min(w, h), cx = w / 2, cy = h / 2, r = s / 2;
        p.setStyle(Paint.Style.FILL);
        p.setColor(kind == WAIT ? 0x40FFFFFF : 0xFFFFFFFF);
        cv.drawCircle(cx, cy, r, p);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeCap(Paint.Cap.ROUND);
        p.setStrokeJoin(Paint.Join.ROUND);
        p.setStrokeWidth(s * .12f);
        p.setColor(color);
        path.reset();
        if (kind == CHECK) {
            path.moveTo(cx - r * .45f, cy + r * .02f);
            path.lineTo(cx - r * .12f, cy + r * .35f);
            path.lineTo(cx + r * .45f, cy - r * .3f);
            cv.drawPath(path, p);
        } else if (kind == CROSS) {
            float d = r * .36f;
            cv.drawLine(cx - d, cy - d, cx + d, cy + d, p);
            cv.drawLine(cx + d, cy - d, cx - d, cy + d, p);
        } else if (kind == QUESTION) {
            RectF o = new RectF(cx - r * .3f, cy - r * .55f, cx + r * .3f, cy + r * .05f);
            path.addArc(o, 180, 270);
            path.lineTo(cx, cy + r * .2f);
            cv.drawPath(path, p);
            p.setStyle(Paint.Style.FILL);
            cv.drawCircle(cx, cy + r * .48f, s * .07f, p);
        } else {
            p.setColor(0xFFFFFFFF);
            RectF o = new RectF(cx - r * .62f, cy - r * .62f, cx + r * .62f, cy + r * .62f);
            cv.drawArc(o, angle, 100, false, p);
            angle = (angle + 12) % 360;
            postInvalidateOnAnimation();
        }
    }
}
