# Renders a batch of TTS jobs (JSON: [{ voice, rate, text, out }]) to 24 kHz mono WAV files.
param([string]$JobsPath)
Add-Type -AssemblyName System.Speech
$jobs = Get-Content $JobsPath -Raw -Encoding UTF8 | ConvertFrom-Json
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(24000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
foreach ($j in $jobs) {
  $synth.SelectVoice($j.voice)
  $synth.Rate = [int]$j.rate
  $synth.SetOutputToWaveFile($j.out, $fmt)
  $synth.Speak($j.text)
}
$synth.SetOutputToNull()
$synth.Dispose()
