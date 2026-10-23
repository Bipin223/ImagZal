package com.bipinrizal.imagzal;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ImagZalPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
