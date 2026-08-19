package com.jerrydoko.resourcesmanager;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.PopupMenu;
import android.widget.ProgressBar;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final int PERMISSION_REQUEST = 40;
    private static final int TREE_REQUEST = 41;
    private static final String PREFS = "resources-manager";
    private static final String PREF_TREES = "tree-uris";

    private final ExecutorService background = Executors.newSingleThreadExecutor();
    private LibraryDb db;
    private MediaAdapter adapter;
    private ProgressBar progress;
    private TextView status;
    private EditText search;
    private Button sortButton;
    private String category = "";
    private String sortField = "title";
    private boolean ascending = true;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        db = new LibraryDb(this);
        adapter = new MediaAdapter(this);
        setContentView(buildContent());
        reload();
        ensurePermissionsAndScan();
    }

    private View buildContent() {
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setBackgroundColor(Ui.SURFACE);

        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(Ui.dp(this, 16), Ui.dp(this, 12), Ui.dp(this, 10), Ui.dp(this, 8));
        TextView title = new TextView(this);
        title.setText("资源管理器");
        title.setTextColor(Ui.INK);
        title.setTextSize(23);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        toolbar.addView(title, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));

        progress = new ProgressBar(this);
        progress.setVisibility(View.GONE);
        toolbar.addView(progress, new LinearLayout.LayoutParams(Ui.dp(this, 32), Ui.dp(this, 32)));

        ImageButton addFolder = iconButton(android.R.drawable.ic_input_add, "添加文件夹");
        addFolder.setOnClickListener(v -> chooseFolder());
        toolbar.addView(addFolder);
        ImageButton scan = iconButton(android.R.drawable.ic_popup_sync, "扫描设备");
        scan.setOnClickListener(v -> ensurePermissionsAndScan());
        toolbar.addView(scan);
        page.addView(toolbar);

        LinearLayout controls = new LinearLayout(this);
        controls.setOrientation(LinearLayout.VERTICAL);
        controls.setPadding(Ui.dp(this, 16), Ui.dp(this, 6), Ui.dp(this, 16), Ui.dp(this, 10));

        search = new EditText(this);
        search.setSingleLine(true);
        search.setHint("搜索名称");
        search.setTextSize(16);
        search.setBackground(Ui.rounded(Color.WHITE, 6, this));
        search.setPadding(Ui.dp(this, 14), 0, Ui.dp(this, 14), 0);
        controls.addView(search, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, Ui.dp(this, 48)));
        search.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) { reload(); }
            @Override public void afterTextChanged(Editable s) {}
        });

        LinearLayout selectors = new LinearLayout(this);
        selectors.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams selectorParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        selectorParams.topMargin = Ui.dp(this, 8);
        controls.addView(selectors, selectorParams);

        Spinner categorySpinner = new Spinner(this);
        String[] categoryNames = {"全部", "图片", "视频", "音频", "文档"};
        ArrayAdapter<String> categories = new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_dropdown_item, categoryNames);
        categorySpinner.setAdapter(categories);
        selectors.addView(categorySpinner, new LinearLayout.LayoutParams(0, Ui.dp(this, 48), 1));
        categorySpinner.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                String[] values = {"", "image", "video", "audio", "document"};
                category = values[position];
                reload();
            }
            @Override public void onNothingSelected(AdapterView<?> parent) {}
        });

        sortButton = new Button(this);
        sortButton.setAllCaps(false);
        sortButton.setTextColor(Ui.BRAND);
        sortButton.setBackgroundColor(Color.TRANSPARENT);
        sortButton.setOnClickListener(this::showSortMenu);
        updateSortLabel();
        selectors.addView(sortButton, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, Ui.dp(this, 48)));
        page.addView(controls);

        status = new TextView(this);
        status.setTextColor(Ui.MUTED);
        status.setTextSize(13);
        status.setPadding(Ui.dp(this, 16), 0, Ui.dp(this, 16), Ui.dp(this, 7));
        page.addView(status);

        ListView list = new ListView(this);
        list.setAdapter(adapter);
        list.setDivider(Ui.divider(this).getBackground());
        list.setDividerHeight(Ui.dp(this, 1));
        list.setBackgroundColor(Color.WHITE);
        list.setOnItemClickListener((parent, view, position, id) -> open(adapter.getItem(position)));
        list.setOnItemLongClickListener((parent, view, position, id) -> {
            showItemActions(adapter.getItem(position));
            return true;
        });
        page.addView(list, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1));
        return page;
    }

    private ImageButton iconButton(int icon, String description) {
        ImageButton button = new ImageButton(this);
        button.setImageResource(icon);
        button.setColorFilter(Ui.INK);
        button.setContentDescription(description);
        button.setBackgroundColor(Color.TRANSPARENT);
        button.setPadding(Ui.dp(this, 11), Ui.dp(this, 11), Ui.dp(this, 11), Ui.dp(this, 11));
        button.setLayoutParams(new LinearLayout.LayoutParams(Ui.dp(this, 48), Ui.dp(this, 48)));
        return button;
    }

    private void showSortMenu(View anchor) {
        PopupMenu menu = new PopupMenu(this, anchor);
        menu.getMenu().add(0, 1, 0, "名称");
        menu.getMenu().add(0, 2, 1, "添加日期");
        menu.getMenu().add(0, 3, 2, "修改日期");
        menu.setOnMenuItemClickListener(item -> {
            String selected = item.getItemId() == 2 ? "added_at"
                    : item.getItemId() == 3 ? "modified_at" : "title";
            if (selected.equals(sortField)) {
                ascending = !ascending;
            } else {
                sortField = selected;
                ascending = true;
            }
            updateSortLabel();
            reload();
            return true;
        });
        menu.show();
    }

    private void updateSortLabel() {
        String name = "title".equals(sortField) ? "名称"
                : "added_at".equals(sortField) ? "添加日期" : "修改日期";
        sortButton.setText(name + (ascending ? " ↑" : " ↓"));
    }

    private void reload() {
        if (db == null || adapter == null) return;
        String currentCategory = category;
        String currentSearch = search == null ? "" : search.getText().toString();
        String currentSort = sortField;
        boolean currentAscending = ascending;
        background.execute(() -> {
            List<MediaItem> result = db.query(
                    currentCategory, currentSearch, currentSort, currentAscending);
            runOnUiThread(() -> {
                adapter.replace(result);
                status.setText(result.size() + " 个项目");
            });
        });
    }

    private void ensurePermissionsAndScan() {
        List<String> missing = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= 33) {
            addIfMissing(missing, Manifest.permission.READ_MEDIA_IMAGES);
            addIfMissing(missing, Manifest.permission.READ_MEDIA_VIDEO);
            addIfMissing(missing, Manifest.permission.READ_MEDIA_AUDIO);
        } else {
            addIfMissing(missing, Manifest.permission.READ_EXTERNAL_STORAGE);
        }
        if (!missing.isEmpty()) {
            requestPermissions(missing.toArray(new String[0]), PERMISSION_REQUEST);
        } else {
            scanAll();
        }
    }

    private void addIfMissing(List<String> result, String permission) {
        if (checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) {
            result.add(permission);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == PERMISSION_REQUEST) scanAll();
    }

    private void scanAll() {
        progress.setVisibility(View.VISIBLE);
        status.setText("正在扫描…");
        background.execute(() -> {
            int count = DeviceScanner.scanMediaStore(this, db);
            SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
            for (String saved : prefs.getStringSet(PREF_TREES, new HashSet<>())) {
                count += DeviceScanner.scanTree(this, db, Uri.parse(saved));
            }
            int scanned = count;
            runOnUiThread(() -> {
                progress.setVisibility(View.GONE);
                Toast.makeText(this, "扫描完成，共发现 " + scanned + " 个项目", Toast.LENGTH_SHORT).show();
                reload();
            });
        });
    }

    private void chooseFolder() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
                | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(intent, TREE_REQUEST);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != TREE_REQUEST || resultCode != RESULT_OK || data == null || data.getData() == null) return;
        Uri tree = data.getData();
        try {
            getContentResolver().takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (SecurityException ignored) {
            Toast.makeText(this, "文件夹授权只能保留到本次运行", Toast.LENGTH_SHORT).show();
        }
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        Set<String> trees = new HashSet<>(prefs.getStringSet(PREF_TREES, new HashSet<>()));
        trees.add(tree.toString());
        prefs.edit().putStringSet(PREF_TREES, trees).apply();
        scanAll();
    }

    private void open(MediaItem item) {
        if ("image".equals(item.mediaType)) {
            Intent intent = new Intent(this, ImageViewerActivity.class);
            putItem(intent, item);
            startActivity(intent);
        } else if ("video".equals(item.mediaType) || "audio".equals(item.mediaType)) {
            Intent intent = new Intent(this, PlayerActivity.class);
            putItem(intent, item);
            startActivity(intent);
        } else {
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(Uri.parse(item.uri), item.mimeType.isEmpty() ? "*/*" : item.mimeType);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            try {
                startActivity(intent);
            } catch (ActivityNotFoundException error) {
                Toast.makeText(this, "手机上没有可打开此文档的应用", Toast.LENGTH_SHORT).show();
            }
        }
    }

    private static void putItem(Intent intent, MediaItem item) {
        intent.putExtra("uri", item.uri);
        intent.putExtra("title", item.title);
        intent.putExtra("mediaType", item.mediaType);
    }

    private void showItemActions(MediaItem item) {
        if (!"video".equals(item.mediaType) && !"audio".equals(item.mediaType)) return;
        new AlertDialog.Builder(this)
                .setTitle(item.title)
                .setItems(new String[]{"重置播放进度", "打开"}, (dialog, which) -> {
                    if (which == 0) {
                        background.execute(() -> {
                            db.saveProgress(item.uri, 0);
                            runOnUiThread(this::reload);
                        });
                    } else {
                        open(item);
                    }
                })
                .show();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (db != null) reload();
    }

    @Override
    protected void onDestroy() {
        adapter.shutdown();
        background.shutdownNow();
        super.onDestroy();
    }
}
