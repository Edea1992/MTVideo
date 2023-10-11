// self.addEventListener("fetch", function(event) {
//     if (event.request.url.match(regex)) {
//         event.respondWith((async () => {
//             const response = await fetch("http://f0.0sm.com/node0/2023/09/8651804F35D8D4E5-b95b76e27b2bc797.bmp")
//             const reader = response.body.getReader()

//             const bytes = new Uint8Array(1024 * 1024 * 5)
//             let loadedBytes = 0
//             while (true) {
//                 const {done, value} = await reader.read()
//                 if (done) {
//                     break
//                 }
//                 bytes.set(value, loadedBytes)
//                 loadedBytes += value.length
//             }

//             const size = new DataView(bytes.buffer).getBigUint64(54, true)

//             return new Response(
//                 new ReadableStream({
//                     start(controller) {
//                         controller.enqueue(bytes.slice(62, 62 + Number(size)))
//                         controller.close()
//                     }
//                 }),
//                 {
//                     headers: {
//                         "Accept-Ranges":  "bytes",
//                         "Content-Length": size,
//                         "Content-Type":  "video/mp2t"
//                     }
//                 }
//             )
//         })())
//     } else {
//         event.respondWith(
//             caches.match(event.request).then(function(response) {
//                 return response || fetch(event.request)
//             })
//         )
//     }
// })

const urlPattern = /https:\/\/raw\.pilipili\.com\/Edea1992\/[\da-fA-F]{8}-[\da-fA-F]{4}-[\da-fA-F]{4}-[\da-fA-F]{4}-[\da-fA-F]{12}\/main\/.+/
const contentRangePattern = /bytes \d+-\d+\/(\d+)/

self.addEventListener("install", () => {
    self.skipWaiting()
})

self.addEventListener("activate", function (event) {
    event.waitUntil(
        clients.claim()
    )
})

function fetchM3U8(url) {
    return new Promise(resolve => {
        const retry = () => fetch(url).then(async response => {
            if (response.status !== 200 && response.status !== 206) {
                retry()
            }
            resolve(await response.text())
        }).catch(retry)
        retry()
    })
}

function fetchWithRetry(url) {
    return new Promise(resolve => {
        const retry = () => fetch(url).then(async response => {
            if (response.status !== 200 && response.status !== 206) {
                retry()
            }
            resolve(new Uint8Array(await response.arrayBuffer()))
        }).catch(retry)
        retry()
    })
}

function concatenateAll(arrays) {
    let totalLength = 0
    for (const array of arrays) {
        totalLength += array.byteLength
    }
    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const array of arrays) {
        result.set(array, offset)
        offset += array.byteLength
    }
    return result
}

self.addEventListener("fetch", (event) => {
    const matches = event.request.url.match(urlPattern)
    if (matches) {
        event.respondWith((async () => {
            const url = event.request.url.replace("pilipili", "githubusercontent")
            if (url.endsWith("m3u8")) {
                const m3u8 = new TextEncoder().encode(await fetchM3U8(url))

                const range = event.request.headers.get("Range")
                if (range) {
                    const parts = range.replace("bytes=", "").split("-")
                    const start = parseInt(parts[0], 10)
                    const end = parts[1] ? parseInt(parts[1], 10) : m3u8.byteLength - 1
                    const chunk = m3u8.slice(start, end + 1)
                    return new Response(
                        new ReadableStream({
                            start(controller) {
                                controller.enqueue(chunk)
                                controller.close()
                            }
                        }),
                        {
                            headers: {
                                "Accept-Ranges": "bytes",
                                "Content-Length": chunk.byteLength,
                                "Content-Range": `bytes ${start}-${end}/${m3u8.byteLength}`,
                                "Content-Type": "application/x-mpegURL"
                            },
                            status: 206
                        }
                    )
                }

                return new Response(
                    new ReadableStream({
                        start(controller) {
                            controller.enqueue(m3u8)
                            controller.close()
                        }
                    }),
                    {
                        headers: {
                            "Accept-Ranges": "bytes",
                            "Content-Length": m3u8.byteLength,
                            "Content-Type": "application/x-mpegURL"
                        }
                    }
                )
            }
            
            const promises = []

            for (let i = 0; i < 32; i++) {
                promises.push(fetchWithRetry(url + "-" + i))
            }

            const bytes = concatenateAll(await Promise.all(promises))

            const range = event.request.headers.get("Range")
            if (range) {
                const parts = range.replace("bytes=", "").split("-")
                const start = parseInt(parts[0], 10)
                const end = parts[1] ? parseInt(parts[1], 10) : bytes.byteLength - 1
                const chunk = bytes.slice(start, end + 1)
                return new Response(
                    new ReadableStream({
                        start(controller) {
                            controller.enqueue(chunk)
                            controller.close()
                        }
                    }),
                    {
                        headers: {
                            "Accept-Ranges": "bytes",
                            "Content-Length": chunk.byteLength,
                            "Content-Range": `bytes ${start}-${end}/${bytes.byteLength}`,
                            "Content-Type": "video/mp2t"
                        },
                        status: 206
                    }
                )
            }

            return new Response(
                new ReadableStream({
                    start(controller) {
                        controller.enqueue(bytes)
                        controller.close()
                    }
                }),
                {
                    headers: {
                        "Accept-Ranges": "bytes",
                        "Content-Length": bytes.byteLength,
                        "Content-Type": "video/mp2t"
                    }
                }
            )
        })())
    } else {
        event.respondWith(
            caches.match(event.request).then(function (response) {
                return response || fetch(event.request)
            })
        )
    }
})
