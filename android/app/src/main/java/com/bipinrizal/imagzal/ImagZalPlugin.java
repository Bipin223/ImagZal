package com.bipinrizal.imagzal;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.widget.Toast;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

@CapacitorPlugin(
    name = "ImagZal",
    permissions = {
        @Permission(
            alias = "storage",
            strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }
        )
    }
)
public class ImagZalPlugin extends Plugin {

    @PluginMethod
    public void saveFile(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
            && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "storagePermission");
            return;
        }

        String data = call.getString("base64");
        String filename = call.getString("filename");
        String mime = call.getString("mime", "application/octet-stream");

        if (data == null || filename == null) {
            call.reject("Missing file data.");
            return;
        }

        String safeName = filename.replaceAll("[\\\\/:*?\"<>|]", "-");
        if (safeName.isEmpty()) safeName = "imagzal-file";
        final String savedName = safeName;

        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            Uri uri;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver resolver = getContext().getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, safeName);
                values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                values.put(
                    MediaStore.MediaColumns.RELATIVE_PATH,
                    Environment.DIRECTORY_DOWNLOADS + "/ImagZal"
                );
                values.put(MediaStore.MediaColumns.IS_PENDING, 1);

                uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) {
                    throw new Exception("Could not create the file in Downloads.");
                }

                try (OutputStream stream = resolver.openOutputStream(uri)) {
                    if (stream == null) {
                        throw new Exception("Could not open the file for writing.");
                    }
                    stream.write(bytes);
                }

                values.clear();
                values.put(MediaStore.MediaColumns.IS_PENDING, 0);
                resolver.update(uri, values, null, null);
            } else {
                File folder = new File(
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                    "ImagZal"
                );
                if (!folder.exists() && !folder.mkdirs()) {
                    throw new Exception("Could not create the Downloads/ImagZal folder.");
                }
                File file = new File(folder, safeName);
                try (FileOutputStream stream = new FileOutputStream(file)) {
                    stream.write(bytes);
                }
                uri = Uri.fromFile(file);
            }

            JSObject result = new JSObject();
            result.put("uri", uri.toString());
            result.put("path", "Downloads/ImagZal/" + safeName);
            call.resolve(result);

            getActivity().runOnUiThread(() ->
                Toast.makeText(
                    getContext(),
                    "Saved to Downloads/ImagZal/" + savedName,
                    Toast.LENGTH_LONG
                ).show()
            );
        } catch (Exception error) {
            call.reject("Could not save the file.", error);
        }
    }

    @PermissionCallback
    private void storagePermission(PluginCall call) {
        if (getPermissionState("storage") == PermissionState.GRANTED) {
            saveFile(call);
        } else {
            call.reject("Storage permission is required to save files.");
        }
    }
}
