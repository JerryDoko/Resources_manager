package com.jerrydoko.resourcesmanager;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.ImageDecoder;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import java.io.InputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class ImageViewerActivity extends Activity {
    private final ExecutorService loader = Executors.newSingleThreadExecutor();

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.BLACK);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        ImageView image = new ImageView(this);
        image.setScaleType(ImageView.ScaleType.FIT_CENTER);
        root.addView(image, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        ProgressBar progress = new ProgressBar(this);
        FrameLayout.LayoutParams progressParams = new FrameLayout.LayoutParams(
                Ui.dp(this, 48), Ui.dp(this, 48), Gravity.CENTER);
        root.addView(progress, progressParams);

        FrameLayout toolbar = new FrameLayout(this);
        toolbar.setBackgroundColor(Color.argb(175, 0, 0, 0));
        toolbar.setPadding(Ui.dp(this, 4), 0, Ui.dp(this, 12), 0);
        FrameLayout.LayoutParams toolbarParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, Ui.dp(this, 56), Gravity.TOP);
        root.addView(toolbar, toolbarParams);

        ImageButton back = new ImageButton(this);
        back.setImageResource(android.R.drawable.ic_media_previous);
        back.setColorFilter(Color.WHITE);
        back.setBackgroundColor(Color.TRANSPARENT);
        back.setContentDescription("返回");
        back.setOnClickListener(v -> finish());
        toolbar.addView(back, new FrameLayout.LayoutParams(Ui.dp(this, 52), Ui.dp(this, 56), Gravity.START));

        TextView title = new TextView(this);
        title.setText(getIntent().getStringExtra("title"));
        title.setTextColor(Color.WHITE);
        title.setTextSize(16);
        title.setGravity(Gravity.CENTER_VERTICAL);
        title.setSingleLine(true);
        title.setEllipsize(android.text.TextUtils.TruncateAt.END);
        FrameLayout.LayoutParams titleParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, Ui.dp(this, 56));
        titleParams.leftMargin = Ui.dp(this, 58);
        titleParams.rightMargin = Ui.dp(this, 12);
        toolbar.addView(title, titleParams);

        root.setOnClickListener(v -> toolbar.setVisibility(
                toolbar.getVisibility() == View.VISIBLE ? View.GONE : View.VISIBLE));
        setContentView(root);

        Uri uri = Uri.parse(getIntent().getStringExtra("uri"));
        loader.execute(() -> {
            Bitmap bitmap = decode(uri);
            runOnUiThread(() -> {
                progress.setVisibility(View.GONE);
                if (bitmap == null) {
                    Toast.makeText(this, "无法读取这张图片", Toast.LENGTH_LONG).show();
                } else {
                    image.setImageBitmap(bitmap);
                }
            });
        });
    }

    private Bitmap decode(Uri uri) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                ImageDecoder.Source source = ImageDecoder.createSource(getContentResolver(), uri);
                int limit = Math.max(
                        getResources().getDisplayMetrics().widthPixels,
                        getResources().getDisplayMetrics().heightPixels) * 2;
                return ImageDecoder.decodeBitmap(source, (decoder, info, source1) -> {
                    int width = info.getSize().getWidth();
                    int height = info.getSize().getHeight();
                    if (Math.max(width, height) > limit) {
                        float scale = (float) limit / Math.max(width, height);
                        decoder.setTargetSize(Math.max(1, Math.round(width * scale)),
                                Math.max(1, Math.round(height * scale)));
                    }
                    decoder.setAllocator(ImageDecoder.ALLOCATOR_SOFTWARE);
                });
            }
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            try (InputStream input = getContentResolver().openInputStream(uri)) {
                BitmapFactory.decodeStream(input, null, bounds);
            }
            int limit = Math.max(
                    getResources().getDisplayMetrics().widthPixels,
                    getResources().getDisplayMetrics().heightPixels) * 2;
            int sample = 1;
            while (Math.max(bounds.outWidth, bounds.outHeight) / sample > limit) sample *= 2;
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inSampleSize = sample;
            try (InputStream input = getContentResolver().openInputStream(uri)) {
                return BitmapFactory.decodeStream(input, null, options);
            }
        } catch (Exception ignored) {
            return null;
        }
    }

    @Override
    protected void onDestroy() {
        loader.shutdownNow();
        super.onDestroy();
    }
}
