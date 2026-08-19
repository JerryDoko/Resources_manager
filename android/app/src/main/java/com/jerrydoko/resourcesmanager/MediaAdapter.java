package com.jerrydoko.resourcesmanager;

import android.content.ContentResolver;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.LruCache;
import android.util.Size;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.io.InputStream;
import java.text.DateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class MediaAdapter extends BaseAdapter {
    private final Context context;
    private final ContentResolver resolver;
    private final List<MediaItem> items = new ArrayList<>();
    private final ExecutorService thumbnails = Executors.newFixedThreadPool(3);
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final LruCache<String, Bitmap> cache;
    private final DateFormat dateFormat = DateFormat.getDateTimeInstance(
            DateFormat.SHORT, DateFormat.SHORT, Locale.getDefault());

    MediaAdapter(Context context) {
        this.context = context;
        this.resolver = context.getContentResolver();
        int cacheSizeKb = Math.max(4 * 1024, (int) (Runtime.getRuntime().maxMemory() / 1024 / 12));
        cache = new LruCache<String, Bitmap>(cacheSizeKb) {
            @Override
            protected int sizeOf(String key, Bitmap value) {
                return value.getByteCount() / 1024;
            }
        };
    }

    void replace(List<MediaItem> replacement) {
        items.clear();
        items.addAll(replacement);
        notifyDataSetChanged();
    }

    void shutdown() {
        thumbnails.shutdownNow();
    }

    @Override public int getCount() { return items.size(); }
    @Override public MediaItem getItem(int position) { return items.get(position); }
    @Override public long getItemId(int position) { return items.get(position).uri.hashCode(); }

    @Override
    public View getView(int position, View convertView, ViewGroup parent) {
        Holder holder;
        if (convertView == null) {
            holder = createRow();
            convertView = holder.root;
            convertView.setTag(holder);
        } else {
            holder = (Holder) convertView.getTag();
        }

        MediaItem item = getItem(position);
        holder.title.setText(item.title);
        holder.location.setText(item.parentName.isEmpty() ? typeLabel(item.mediaType) : item.parentName);
        holder.details.setText(formatDetails(item));
        bindThumbnail(holder.thumbnail, item);
        return convertView;
    }

    private Holder createRow() {
        LinearLayout root = new LinearLayout(context);
        root.setOrientation(LinearLayout.HORIZONTAL);
        root.setGravity(Gravity.CENTER_VERTICAL);
        root.setPadding(Ui.dp(context, 16), Ui.dp(context, 11), Ui.dp(context, 16), Ui.dp(context, 11));
        root.setMinimumHeight(Ui.dp(context, 104));
        root.setBackgroundColor(Color.WHITE);

        ImageView thumbnail = new ImageView(context);
        thumbnail.setScaleType(ImageView.ScaleType.CENTER_CROP);
        thumbnail.setBackground(Ui.rounded(Color.rgb(238, 234, 252), 6, context));
        root.addView(thumbnail, new LinearLayout.LayoutParams(Ui.dp(context, 80), Ui.dp(context, 80)));

        LinearLayout text = new LinearLayout(context);
        text.setOrientation(LinearLayout.VERTICAL);
        text.setPadding(Ui.dp(context, 14), 0, 0, 0);
        root.addView(text, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));

        TextView title = new TextView(context);
        title.setTextColor(Ui.INK);
        title.setTextSize(17);
        title.setSingleLine(true);
        title.setEllipsize(android.text.TextUtils.TruncateAt.END);
        text.addView(title, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        TextView location = secondaryText();
        location.setSingleLine(true);
        location.setEllipsize(android.text.TextUtils.TruncateAt.MIDDLE);
        LinearLayout.LayoutParams locationParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        locationParams.topMargin = Ui.dp(context, 4);
        text.addView(location, locationParams);

        TextView details = secondaryText();
        details.setSingleLine(true);
        details.setEllipsize(android.text.TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams detailParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        detailParams.topMargin = Ui.dp(context, 3);
        text.addView(details, detailParams);
        return new Holder(root, thumbnail, title, location, details);
    }

    private TextView secondaryText() {
        TextView view = new TextView(context);
        view.setTextColor(Ui.MUTED);
        view.setTextSize(13);
        return view;
    }

    private String formatDetails(MediaItem item) {
        String size = formatSize(item.size);
        long date = item.modifiedAt > 0 ? item.modifiedAt : item.addedAt;
        String dateText = date > 0 ? dateFormat.format(new Date(date)) : "时间未知";
        if (item.progress > 0 && item.duration > 0) {
            int percent = (int) Math.min(100, item.progress * 100 / item.duration);
            return size + " · " + dateText + " · 已播放 " + percent + "%";
        }
        return size + " · " + dateText;
    }

    private void bindThumbnail(ImageView view, MediaItem item) {
        view.setTag(item.uri);
        Bitmap cached = cache.get(item.uri);
        if (cached != null) {
            view.setScaleType(ImageView.ScaleType.CENTER_CROP);
            view.setImageBitmap(cached);
            return;
        }
        view.setScaleType(ImageView.ScaleType.CENTER);
        if ("video".equals(item.mediaType)) {
            view.setImageResource(android.R.drawable.ic_media_play);
        } else if ("audio".equals(item.mediaType)) {
            view.setImageResource(android.R.drawable.ic_media_ff);
        } else if ("document".equals(item.mediaType)) {
            view.setImageResource(android.R.drawable.ic_menu_agenda);
        } else {
            view.setImageResource(android.R.drawable.ic_menu_gallery);
        }
        if (!"image".equals(item.mediaType) && !"video".equals(item.mediaType)) return;

        thumbnails.execute(() -> {
            Bitmap bitmap = loadThumbnail(Uri.parse(item.uri), item.mediaType);
            if (bitmap == null) return;
            cache.put(item.uri, bitmap);
            mainHandler.post(() -> {
                if (item.uri.equals(view.getTag())) {
                    view.setScaleType(ImageView.ScaleType.CENTER_CROP);
                    view.setImageBitmap(bitmap);
                }
            });
        });
    }

    private Bitmap loadThumbnail(Uri uri, String type) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                return resolver.loadThumbnail(uri, new Size(240, 240), null);
            }
            if (!"image".equals(type)) return null;
            try (InputStream stream = resolver.openInputStream(uri)) {
                BitmapFactory.Options options = new BitmapFactory.Options();
                options.inSampleSize = 4;
                return BitmapFactory.decodeStream(stream, null, options);
            }
        } catch (Exception ignored) {
            return null;
        }
    }

    private static String formatSize(long bytes) {
        if (bytes <= 0) return "大小未知";
        if (bytes < 1024) return bytes + " B";
        double value = bytes / 1024.0;
        if (value < 1024) return String.format(Locale.getDefault(), "%.1f KB", value);
        value /= 1024.0;
        if (value < 1024) return String.format(Locale.getDefault(), "%.1f MB", value);
        return String.format(Locale.getDefault(), "%.1f GB", value / 1024.0);
    }

    private static String typeLabel(String type) {
        switch (type) {
            case "image": return "图片";
            case "video": return "视频";
            case "audio": return "音频";
            default: return "文档";
        }
    }

    private static final class Holder {
        final LinearLayout root;
        final ImageView thumbnail;
        final TextView title;
        final TextView location;
        final TextView details;

        Holder(LinearLayout root, ImageView thumbnail, TextView title, TextView location, TextView details) {
            this.root = root;
            this.thumbnail = thumbnail;
            this.title = title;
            this.location = location;
            this.details = details;
        }
    }
}
