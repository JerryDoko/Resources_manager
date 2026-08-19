package com.jerrydoko.resourcesmanager;

import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;
import android.widget.VideoView;

import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class PlayerActivity extends Activity {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService storage = Executors.newSingleThreadExecutor();
    private LibraryDb db;
    private VideoView video;
    private SeekBar seek;
    private TextView time;
    private ImageButton play;
    private View topControls;
    private View bottomControls;
    private String uriString;
    private boolean seeking;
    private boolean prepared;
    private long lastSavedAt;

    private final Runnable updateProgress = new Runnable() {
        @Override public void run() {
            if (prepared && video != null) {
                int position = video.getCurrentPosition();
                int duration = video.getDuration();
                if (!seeking && duration > 0) {
                    seek.setMax(duration);
                    seek.setProgress(position);
                }
                time.setText(formatTime(position) + " / " + formatTime(duration));
                if (video.isPlaying() && System.currentTimeMillis() - lastSavedAt >= 2000) {
                    save(position);
                    lastSavedAt = System.currentTimeMillis();
                }
                play.setImageResource(video.isPlaying()
                        ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play);
            }
            handler.postDelayed(this, 500);
        }
    };

    private final Runnable hideControls = () -> {
        if (prepared && video.isPlaying()) setControlsVisible(false);
    };

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);
        uriString = getIntent().getStringExtra("uri");
        String title = getIntent().getStringExtra("title");
        boolean audio = "audio".equals(getIntent().getStringExtra("mediaType"));
        db = new LibraryDb(this);
        setContentView(buildPlayer(title, audio));
        video.setVideoURI(Uri.parse(uriString));
        video.setOnPreparedListener(player -> storage.execute(() -> {
            long saved = db.getProgress(uriString);
            runOnUiThread(() -> {
                prepared = true;
                if (saved > 0 && saved < player.getDuration() - 3000) {
                    video.seekTo((int) Math.min(saved, Integer.MAX_VALUE));
                }
                video.start();
                scheduleHide();
            });
        }));
        video.setOnCompletionListener(player -> {
            save(0);
            setControlsVisible(true);
        });
        video.setOnErrorListener((player, what, extra) -> {
            Toast.makeText(this, "此文件无法播放或编码不受支持", Toast.LENGTH_LONG).show();
            return true;
        });
        handler.post(updateProgress);
    }

    private View buildPlayer(String titleText, boolean audio) {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        video = new VideoView(this);
        video.setOnClickListener(v -> toggleControls());
        FrameLayout.LayoutParams videoParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.CENTER);
        root.addView(video, videoParams);

        if (audio) {
            LinearLayout audioCover = new LinearLayout(this);
            audioCover.setOrientation(LinearLayout.VERTICAL);
            audioCover.setGravity(Gravity.CENTER);
            audioCover.setPadding(Ui.dp(this, 36), Ui.dp(this, 36), Ui.dp(this, 36), Ui.dp(this, 120));
            TextView symbol = new TextView(this);
            symbol.setText("♫");
            symbol.setTextColor(Ui.BRAND);
            symbol.setTextSize(72);
            symbol.setGravity(Gravity.CENTER);
            audioCover.addView(symbol, new LinearLayout.LayoutParams(Ui.dp(this, 140), Ui.dp(this, 140)));
            TextView audioTitle = new TextView(this);
            audioTitle.setText(titleText);
            audioTitle.setTextColor(Color.WHITE);
            audioTitle.setTextSize(20);
            audioTitle.setGravity(Gravity.CENTER);
            audioTitle.setMaxLines(3);
            LinearLayout.LayoutParams audioTitleParams = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            audioTitleParams.topMargin = Ui.dp(this, 20);
            audioCover.addView(audioTitle, audioTitleParams);
            audioCover.setOnClickListener(v -> toggleControls());
            root.addView(audioCover, videoParams);
        }

        topControls = createTopControls(titleText);
        root.addView(topControls, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, Ui.dp(this, 64), Gravity.TOP));
        bottomControls = createBottomControls();
        FrameLayout.LayoutParams bottomParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, Ui.dp(this, 92), Gravity.BOTTOM);
        root.addView(bottomControls, bottomParams);
        return root;
    }

    private View createTopControls(String titleText) {
        LinearLayout top = new LinearLayout(this);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(Ui.dp(this, 4), 0, Ui.dp(this, 12), 0);
        top.setBackgroundColor(Color.argb(185, 0, 0, 0));

        ImageButton back = controlButton(android.R.drawable.ic_media_previous, "返回");
        back.setOnClickListener(v -> finish());
        top.addView(back);
        TextView title = new TextView(this);
        title.setText(titleText);
        title.setTextColor(Color.WHITE);
        title.setTextSize(16);
        title.setSingleLine(true);
        title.setEllipsize(android.text.TextUtils.TruncateAt.END);
        top.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        ImageButton reset = controlButton(android.R.drawable.ic_menu_revert, "重置播放进度");
        reset.setOnClickListener(v -> {
            if (prepared) video.seekTo(0);
            seek.setProgress(0);
            save(0);
            Toast.makeText(this, "播放进度已重置", Toast.LENGTH_SHORT).show();
            scheduleHide();
        });
        top.addView(reset);
        return top;
    }

    private View createBottomControls() {
        LinearLayout bottom = new LinearLayout(this);
        bottom.setOrientation(LinearLayout.VERTICAL);
        bottom.setPadding(Ui.dp(this, 12), Ui.dp(this, 8), Ui.dp(this, 12), Ui.dp(this, 8));
        bottom.setBackgroundColor(Color.argb(190, 0, 0, 0));

        seek = new SeekBar(this);
        seek.setProgressTintList(android.content.res.ColorStateList.valueOf(Ui.BRAND));
        seek.setThumbTintList(android.content.res.ColorStateList.valueOf(Ui.BRAND));
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                if (fromUser) time.setText(formatTime(progress) + " / " + formatTime(seekBar.getMax()));
            }
            @Override public void onStartTrackingTouch(SeekBar seekBar) {
                seeking = true;
                handler.removeCallbacks(hideControls);
            }
            @Override public void onStopTrackingTouch(SeekBar seekBar) {
                seeking = false;
                if (prepared) video.seekTo(seekBar.getProgress());
                save(seekBar.getProgress());
                scheduleHide();
            }
        });
        bottom.addView(seek, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, Ui.dp(this, 38)));

        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        play = controlButton(android.R.drawable.ic_media_play, "播放或暂停");
        play.setOnClickListener(v -> {
            if (!prepared) return;
            if (video.isPlaying()) {
                video.pause();
                setControlsVisible(true);
            } else {
                video.start();
                scheduleHide();
            }
        });
        row.addView(play);
        time = new TextView(this);
        time.setText("0:00 / 0:00");
        time.setTextColor(Color.WHITE);
        time.setTextSize(13);
        row.addView(time, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        bottom.addView(row, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, Ui.dp(this, 38)));
        return bottom;
    }

    private ImageButton controlButton(int resource, String description) {
        ImageButton button = new ImageButton(this);
        button.setImageResource(resource);
        button.setColorFilter(Color.WHITE);
        button.setBackgroundColor(Color.TRANSPARENT);
        button.setContentDescription(description);
        button.setPadding(Ui.dp(this, 11), Ui.dp(this, 11), Ui.dp(this, 11), Ui.dp(this, 11));
        button.setLayoutParams(new LinearLayout.LayoutParams(Ui.dp(this, 52), Ui.dp(this, 52)));
        return button;
    }

    private void toggleControls() {
        boolean visible = topControls.getVisibility() == View.VISIBLE;
        setControlsVisible(!visible);
        if (!visible) scheduleHide();
    }

    private void setControlsVisible(boolean visible) {
        int visibility = visible ? View.VISIBLE : View.GONE;
        topControls.setVisibility(visibility);
        bottomControls.setVisibility(visibility);
        if (visible) {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
    }

    private void scheduleHide() {
        handler.removeCallbacks(hideControls);
        handler.postDelayed(hideControls, 2600);
    }

    private void save(long position) {
        if (uriString == null || storage.isShutdown()) return;
        storage.execute(() -> db.saveProgress(uriString, position));
    }

    private static String formatTime(long milliseconds) {
        long seconds = Math.max(milliseconds, 0) / 1000;
        long hours = seconds / 3600;
        long minutes = (seconds % 3600) / 60;
        long remainder = seconds % 60;
        if (hours > 0) return String.format(Locale.getDefault(), "%d:%02d:%02d", hours, minutes, remainder);
        return String.format(Locale.getDefault(), "%d:%02d", minutes, remainder);
    }

    @Override
    protected void onPause() {
        if (prepared && video != null) save(video.getCurrentPosition());
        if (video != null && video.isPlaying()) video.pause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (video != null) video.stopPlayback();
        storage.shutdown();
        super.onDestroy();
    }
}
