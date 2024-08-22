import boto3
import os

s3 = boto3.client('s3')

bucket_name = 'cfb-realignment-site'
prefix = 'media/images/school_logos/'  # Add your S3 directory prefix here
local_directory = './school_logos/'  # Add your local directory path here

# Ensure the local directory exists
if not os.path.exists(local_directory):
    os.makedirs(local_directory)

# List objects within the specified S3 prefix
response = s3.list_objects_v2(Bucket=bucket_name, Prefix=prefix)

# Download each file in the directory
for obj in response.get('Contents', []):
    s3_file_path = obj['Key']
    local_file_path = os.path.join(local_directory, os.path.relpath(s3_file_path, prefix))

    # Ensure the local directory exists
    os.makedirs(os.path.dirname(local_file_path), exist_ok=True)

    print(f'Downloading {s3_file_path} to {local_file_path}...')
    s3.download_file(bucket_name, s3_file_path, local_file_path)
