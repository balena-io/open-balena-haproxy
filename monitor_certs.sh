HAPROXY_PID=$1

echo "Starting file monitor"
while true; do
    inotifywait -r -e create -e modify -e delete /certs
    echo "Certificate change detected. Reloading..."
    kill -SIGUSR2 $HAPROXY_PID
    sleep 1;
done
