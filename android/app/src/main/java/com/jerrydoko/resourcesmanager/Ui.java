package com.jerrydoko.resourcesmanager;

import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.view.View;

final class Ui {
    static final int BRAND = Color.rgb(112, 71, 235);
    static final int INK = Color.rgb(23, 32, 51);
    static final int MUTED = Color.rgb(113, 128, 154);
    static final int SURFACE = Color.rgb(247, 248, 250);
    static final int DIVIDER = Color.rgb(225, 229, 237);

    private Ui() {}

    static int dp(Context context, float value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }

    static GradientDrawable rounded(int color, float radiusDp, Context context) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(context, radiusDp));
        return drawable;
    }

    static View divider(Context context) {
        View divider = new View(context);
        divider.setBackgroundColor(DIVIDER);
        return divider;
    }
}
