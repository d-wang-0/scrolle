package com.example.scrolle;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // The page draws its own scrollbar; hide the WebView's native scroll indicator.
        getBridge().getWebView().setVerticalScrollBarEnabled(false);
    }
}
