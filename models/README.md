# YOLOv8n ONNX

Person detection uses a prebuilt YOLOv8n COCO ONNX file. The running application does not use Python.

Expected layout:

- Input `[1, 3, 640, 640]`, RGB, 0–1, NCHW. The input name is read from the model.
- Output `[1, 84, 8400]` or `[1, 8400, 84]`. Only COCO class 0 (person) is kept.

Download the file to `models/yolov8n.onnx`. The helper script fetches a public YOLOv8n ONNX export. Ultralytics YOLO weights are licensed under AGPL-3.0. Confirm that license before distributing the file.

```powershell
node scripts/download-model.mjs
```

If the official asset URL changes, place any compatible YOLOv8n ONNX export at `MODEL_PATH`.
