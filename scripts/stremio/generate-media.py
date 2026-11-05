import pathlib,subprocess,imageio_ffmpeg
folder=pathlib.Path('.cache/stremio-fixture');folder.mkdir(parents=True,exist_ok=True)
ff=imageio_ffmpeg.get_ffmpeg_exe()
subprocess.run([ff,'-y','-f','lavfi','-i','testsrc2=size=320x180:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-f','lavfi','-i','sine=frequency=660:sample_rate=44100','-t','8','-map','0:v','-map','1:a','-map','2:a','-c:v','libx264','-preset','ultrafast','-g','24','-c:a','aac','-metadata:s:a:0','language=por','-metadata:s:a:1','language=eng','-movflags','+faststart',str(folder/'sample.mp4')],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
subprocess.run([ff,'-y','-i',str(folder/'sample.mp4'),'-map','0:a:0','-map','0:a:1','-map','0:v:0','-c','copy','-f','hls','-hls_time','2','-hls_playlist_type','vod','-var_stream_map','a:0,agroup:audio,language:por,name:Portuguese a:1,agroup:audio,language:eng,name:English v:0,agroup:audio','-master_pl_name','master.m3u8','-hls_segment_filename',str(folder/'v%v_%03d.ts'),str(folder/'v%v.m3u8')],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
print('Mídia sintética original CC0 gerada em',folder)

master=folder/'master.m3u8'
lines=master.read_text().splitlines(); filtered=[]; skip=False
for line in lines:
 if line.startswith('#EXT-X-STREAM-INF:') and 'RESOLUTION=' not in line: skip=True; continue
 if skip: skip=False; continue
 filtered.append(line)
master.write_text('\n'.join(filtered)+'\n')
